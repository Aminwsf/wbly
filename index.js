const Botly = require("botly");
const axios = require("axios");
const bodyParser = require("body-parser");
const WattpadScraper = require('wattpad-scraper');
const cheerio = require('cheerio');

// Initialize Botly with your Facebook page token and verify 
const botly = new Botly({
  accessToken: process.env.FBTOKEN,
  verifyToken: "abcd1234",
});

const users = {};
const scraper = new WattpadScraper();
// Handle incoming messages

botly.on("message", async (senderId, message, data) => {
  if (data.text || message.message.text) {
    const text = message.message.text;
    console.log(`user ${senderId} send message`)
    if (!users[senderId]) {
      botly.sendText({
          id: senderId,
          text: "ماذا تستخدم؟",
          quick_replies: [
            botly.createQuickReply("فيسبوك لايت", "fblite"),
            botly.createQuickReply("ماسنجر", "mxilite"),
          ],
        });
      return
    }

    if (text.startsWith("profile ")) {
      const qry = text.replace("profile ", "").trim();
      await handleProfileSearch(senderId, qry);
    } else if (text.startsWith("usename ")) {
      const username = text.replace("username ", "").trim();
      await handleProfileStories(senderId, username);
    } else if (text.startsWith("parts ")) {
      const url = text.replace("parts ", "").trim();
      await handleParts(senderId, url);
    } else if (text.startsWith("read ")) {
      const url = text.replace("read ", "").trim();
      await handleRead(senderId, url);
    } else if (text.startsWith("/reset")) {
      delete users[senderId]
      botly.sendText({
          id: senderId,
          text: "ماذا تستخدم؟",
          quick_replies: [
            botly.createQuickReply("فيسبوك لايت", "fblite"),
            botly.createQuickReply("ماسنجر", "mxilite"),
          ],
        });
    } else {
        await handleSearch(senderId, text);
    }
  }
});


// Webhook setup
botly.on("postback", (senderId, message, postback) => {
  console.log(`user: ${senderId} clicked: ${postback}`);
  if (postback) {
  if (postback.startsWith("username ")) {
      const username = postback.replace("username ", "").trim();
      handleProfileStories(senderId, username);
    } else if (postback.startsWith("parts ")) {
    const url = postback.replace("parts ", "").trim();
    handleParts(senderId, url);
  } else if (postback.startsWith("read ")) {
    const url = postback.replace("read ", "").trim();
    handleRead(senderId, url);
  } else if (postback.startsWith("Smore ")) {
    const url = postback.replace("Smore ", "").trim();
    handleSmore(senderId, url);
  } else if (postback === "more_parts") {
    showMoreParts(senderId);
  } else if (postback.startsWith("next_part")) {
      const url = postback.replace("next_part ", "").trim();
      handleRead(senderId, url);
    } else if (postback === "back_to_parts") {
    const userParts = users[senderId];
    if (userParts && userParts.parts) {
      userParts.currentIndex = 0;
      showMoreParts(senderId);
    } else {
      botly.sendText({ id: senderId, text: "لا توجد فصول متاحة للرجوع إليها." });
    }
  } else if (postback === "fblite") {
    users[senderId] = {
      mxilite: false,
      currentIndex: 0,
      parts: [],
    };
    botly.sendText({ id: senderId, text: "عن اي رواية تبحث؟", quick_replies: [botly.createQuickReply("إعادة التعيين 🔁", "Reset")] });
  } else if (postback === "mxilite") {
    users[senderId] = {
      mxilite: true,
      currentIndex: 0,
      parts: [],
    };
    botly.sendText({ id: senderId, text: "عن اي رواية تبحث؟", quick_replies: [botly.createQuickReply("إعادة التعيين 🔁", "Reset")] });
  } else if (postback === "Reset") {
    delete users[senderId]
    botly.sendText({
          id: senderId,
          text: "ماذا تستخدم؟",
          quick_replies: [
            botly.createQuickReply("فيسبوك لايت", "fblite"),
            botly.createQuickReply("ماسنجر", "mxilite"),
          ],
        });
  }
  }
});

botly.router().post("/", (req, res) => {
  botly.verify(req, res);
});

// Start the server
const express = require("express");
const app = express();

app.get("/", function (_req, res) {
  res.sendStatus(200);
});

app.use(
  bodyParser.json({
    verify: botly.getVerifySignature(process.env.FBVS),
  })
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use("/webhook", botly.router());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot is running on port ${PORT}`));


async function handleSearch(senderId, query) {
  try {
  const response = await axios.get(`https://www.wattpad.com/v4/search/users/?query=${query}&limit=9&offset=0&fields=username,name,avatar,description,numLists,numFollowers,numStoriesPublished,badges,following`);
   // const results = await scraper.search(query);
    const results = response.data.stories
    if (results.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = results.slice(0, 9).map((story, index) => 
          `${index + 1}. ${story.title}\nالمؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 30)}`
        ).join("\n\n");

        const quickReplies = results.slice(0, 9).map(story => 
          botly.createQuickReply(story.title, `parts ${story.url}`)
        );
        quickReplies.push(botly.createQuickReply("إعادة التعيين 🔁", "Reset"));
        if (response.data?.nextUrl) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", `Smore ${response.data.nextUrl}`));
        }

        botly.sendText({
          id: senderId,
          text: `${storyDetails}\n\nحدد الرواية:`,
          quick_replies: quickReplies,
        });
      } else {
        const elements = results.slice(0, 7).map(story => ({
          title: story.title,
          image_url: story.cover,
          subtitle: `المؤلف: ${story.user.namr}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 20)}`,
          buttons: [
            botly.createWebURLButton("اقرأ على واتباد", story.url),
            botly.createPostbackButton("عرض الفصول", `parts ${story.url}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });
        await new Promise(resolve => setTimeout(resolve, 3000));
        const quickReplies = [botly.createQuickReply("إعادة التعيين 🔁", "Reset")]
        if (response.data?.nextUrl) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", `Smore ${response.data.nextUrl}`));
        }
    botly.sendText({ id: senderId, text: "اذا كنت تستخدم فيسبوك لايت فلن تظهر لك القائمة، إضغط اعادة التعيين و اختر فيسبوك لايت", quick_replies: quickReplies });
      }
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على أي قصص. جرّب البحث مرة أخرى." });
    }
  } catch (error) {
    console.error("Error fetching search results:", error);
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء البحث." });
  }
}

async function handleSmore(senderId, url) {
  try {
  const response = await axios.get(url);
   // const results = await scraper.search(query);
    const results = response.data.stories
    if (results.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = results.slice(0, 9).map((story, index) => 
          `${index + 1}. ${story.title}\nالمؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 30)}`
        ).join("\n\n");

        const quickReplies = results.slice(0, 9).map(story => 
          botly.createQuickReply(story.title, `parts ${story.url}`)
        );
        quickReplies.push(botly.createQuickReply("إعادة التعيين 🔁", "Reset"));
        if (response.data?.nextUrl) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", `Smore ${response.data.nextUrl}`));
        }

        botly.sendText({
          id: senderId,
          text: `${storyDetails}\n\nحدد الرواية:`,
          quick_replies: quickReplies,
        });
      } else {
        const elements = results.slice(0, 7).map(story => ({
          title: story.title,
          image_url: story.cover,
          subtitle: `المؤلف: ${story.user.namr}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 20)}`,
          buttons: [
            botly.createWebURLButton("اقرأ على واتباد", story.url),
            botly.createPostbackButton("عرض الفصول", `parts ${story.url}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });
        await new Promise(resolve => setTimeout(resolve, 3000));
        const quickReplies = [botly.createQuickReply("إعادة التعيين 🔁", "Reset")]
        if (response.data?.nextUrl) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", `Smore ${response.data.nextUrl}`));
        }
    botly.sendText({ id: senderId, text: "اذا كنت تستخدم فيسبوك لايت فلن تظهر لك القائمة، إضغط اعادة التعيين و اختر فيسبوك لايت", quick_replies: quickReplies });
      }
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على أي قصص. جرّب البحث مرة أخرى." });
    }
  } catch (error) {
    console.error("Error fetching search results:", error);
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء البحث." });
  }
}



async function handleParts(senderId, url) {
  try {
   /* const response = await axios.get(`https://myapi.ddns.net/api/search/wattpad/parts?&url=${url}`);
    const parts = response.data;*/
    const parts = await getParts(url);

    if (parts.length > 0) {
      users[senderId].parts = parts;
      users[senderId].currentIndex = 0;

      const quickReplies = parts.slice(0, 3).map(part =>
        botly.createQuickReply(part.title, `read ${part.link}`)
      );
      quickReplies.push(botly.createQuickReply("عرض المزيد", "more_parts"));

      botly.sendText({
        id: senderId,
        text: "حدد الفصل:",
        quick_replies: quickReplies,
      });
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على فصول لهذه القصة." });
    }
  } catch (error) {
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء جلب الفصول." });
  }
}

async function showMoreParts(senderId) {
  if (users[senderId] && users[senderId].parts) {
    const userParts = users[senderId];
    const startIndex = userParts.currentIndex + 3;

    if (startIndex < userParts.parts.length) {
      const quickReplies = userParts.parts.slice(startIndex, startIndex + 3).map(part =>
        botly.createQuickReply(part.title, `read ${part.link}`)
      );
      quickReplies.push(botly.createQuickReply("عرض المزيد", "more_parts"));

      userParts.currentIndex += 3;

      botly.sendText({
        id: senderId,
        text: "حدد الفصل:",
        quick_replies: quickReplies,
      });
    } else {
      await botly.sendText({ id: senderId, text: "لا توجد فصول أخرى متاحة." });
      userParts.currentIndex = 0
      //await new Promise(resolve => setTimeout(resolve, 3000));
      //showMoreParts(senderId)
    }
  } else {
    botly.sendText({ id: senderId, text: "لا توجد فصول متاحة لإظهار المزيد." });
  }
}

async function handleRead(senderId, url) {
  try {
    /*const response = await axios.get(`https://myapi.ddns.net/api/search/wattpad/read?url=${url}`);
    const pages = response.data;*/
    const pagess = await scraper.read(url);
    const pages = pagess.map(page => ({
      page: page.pageNumber,
      content: page.content,
      //url: page.url
    }));

    if (pages.length > 0) {
      const content = pages.map(page => `Page ${page.page}: ${page.content}`).join("\n\n");
      const chunkSize = 2000;

      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
         botly.sendText({ id: senderId, text: chunk });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const user = users[senderId];
      const currentIndex = user.parts.findIndex(part => part.link === url);

      if (currentIndex !== -1 && currentIndex + 1 < user.parts.length) {
        const nextPart = user.parts[currentIndex + 1];

        botly.sendText({
          id: senderId,
          text: "نهاية هذا الفصل هل ترغب بالاستمرار؟",
          quick_replies: [
            botly.createQuickReply("الفصل التالي", `read ${nextPart.link}`),
            botly.createQuickReply("العودة إلى الفصول", "back_to_parts"),
          ],
        });
      } else {
          botly.sendText({
            id: senderId,
            text: "انتهى هذا الجزء. لم يعد هناك أجزاء متاحة.",
            quick_replies: [
              botly.createQuickReply("العودة إلى الفصول", "back_to_parts"),
            ],
          });
        }
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على محتوى لهذا الفصل." });
    }
  } catch (error) {
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء القراءة." });
  }
}


async function getParts(url) {
    try {
        const response = await axios.get(url);
        const html = response.data;
        const $ = cheerio.load(html);
        const storyPartsList = $('ul[aria-label="story-parts"]'); // Updated selector
        const storyParts = [];

        storyPartsList.find('li').each((_, element) => {
            const $element = $(element);
            const title = $element.find('.if-sT').text().trim(); // Updated to match the new structure
            const link = $element.find('a').attr('href');
            storyParts.push({ title, link: link });
        });

        return storyParts;
    } catch (error) {
        throw new Error(error.message);
    }
}

async function handleProfileSearch(senderId, query) {
  try {
    //const response = await axios.get(`https://www.wattpad.com/v4/search/users/?query=${query}&limit=11&offset=0&fields=username,name,avatar,description,numLists,numFollowers,numStoriesPublished,badges,following`);
    
    const results = await searchProfile(query)

    // التحقق من أن النتائج عبارة عن مصفوفة
    if (results && results.length > 0) {
      const ismxiLite = users[senderId]?.mxilite;

      if (!ismxiLite) {
        let profileDetails = results.slice(0, 10).map((user, index) => 
          `${index + 1}. ${user.name}\n@${user.username}\nمتابعين: ${user.numFollowers || 0}, القصص المنشورة: ${user.numStoriesPublished || 0}`
        ).join("\n\n");

        const quickReplies = results.slice(0, 10).map(user => 
          botly.createQuickReply(user.name, `username ${user.username}`)
        );

        botly.sendText({
          id: senderId,
          text: `${profileDetails}\n\nحدد المستخدم:`,
          quick_replies: quickReplies,
        });
      } else {
        const elements = results.slice(0, 7).map(user => ({
          title: user.name,
          image_url: user.avatar,
          subtitle: `متابعين: ${user.numFollowers || 0}, القصص المنشورة: ${user.numStoriesPublished || 0}`,
          buttons: [
            botly.createWebURLButton("زيارة الملف الشخصي", `https://www.wattpad.com/user/${user.username}`),
            botly.createPostbackButton("عرض القصص", `username ${user.username}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });
        await new Promise(resolve => setTimeout(resolve, 3000));
        botly.sendText({ id: senderId, text: "إذا كنت تستخدم فيسبوك لايت فلن تظهر لك القائمة. اضغط إعادة التعيين واختر فيسبوك لايت.", quick_replies: [botly.createQuickReply("إعادة التعيين 🔁", "Reset")] });
      }
    } else if (results && typeof results === "object") {
      botly.sendText({ id: senderId, text: "النتائج ليست مصفوفة كما هو متوقع. تحقق من البيانات الواردة من API." });
      console.error("البيانات الواردة من API:", results);
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على أي ملفات شخصية. جرّب البحث مرة أخرى." });
    }
  } catch (error) {
    console.error("حدث خطأ أثناء جلب نتائج البحث:", error);
    botly.sendText({ id: senderId, text: "عذرًا، حدث خطأ أثناء البحث." });
  }
}


async function handleProfileStories(senderId, username) {
  try {
    const response = await axios.get(`https://www.wattpad.com/v4/users/${username}/stories/published?offset=0&limit=11&fields=stories(title,lastPublishedPart,voteCount,readCount,commentCount,cover,tags,url,id,description,categories,completed,mature,rating,rankings,tagRankings,numParts,firstPartId,parts,isPaywalled,paidModel),total`);
    const stories = response.data.stories; // Assuming the API returns stories in `data.stories`
    
    if (stories.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = stories.map((story, index) => 
          `${index + 1}. ${story.title}\n${story.description}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}\n`
        ).join("\n\n");

        const quickReplies = stories.map(story => 
          botly.createQuickReply(story.title, `parts ${story.url}`)
        );
        // quickReplies.push(botly.createQuickReply("رجوع 🔙", "profileBack"));

        botly.sendText({
          id: senderId,
          text: `${storyDetails}\n\nحدد الرواية لعرضها:`,
          quick_replies: quickReplies,
        });
      } else {
        const elements = stories.map(story => ({
          title: story.title,
          image_url: story.cover,
          subtitle: `قراءات: ${story.readCount}, إعجابات: ${story.voteCount}`,
          buttons: [
            botly.createWebURLButton("اقرأ الرواية", story.url),
            botly.createPostbackButton("عرض الفصول", `parts ${story.url}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });
        await new Promise(resolve => setTimeout(resolve, 3000));
        botly.sendText({ id: senderId, text: "اذا كنت تستخدم فيسبوك لايت فلن تظهر لك القائمة، إضغط رجوع واختر فيسبوك لايت", quick_replies: [botly.createQuickReply("رجوع 🔙", "profileBack")] });
      }
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على أي روايات منشورة لهذا المستخدم." });
    }
  } catch (error) {
    console.error("Error fetching user's stories:", error);
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء عرض الروايات." });
  }
}


async function searchProfile(query) {
    try {
        const response = await axios.get(`https://www.wattpad.com/v4/search/users/?query=${query}&limit=11&offset=0&fields=username,name,avatar,description,numLists,numFollowers,numStoriesPublished,badges,following`);
      console.log(response.data)
      return response.data
      //const profiles = response.data
    /*const url = `https://www.wattpad.com/search/${encodeURIComponent(query)}/people`; // Replace with the actual URL
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const profiles = [];
        $('.list-group .list-group-item').each((index, element) => {
            const profileCard = $(element).find('.profile-card-data');
            const username = profileCard.find('.username').text().trim();
            const name = profileCard.find('h5').text().trim();
            const imageUrl = profileCard.find('img.display-pic').attr('src');
            const stories = profileCard.find('.card-meta').find('p').eq(0).text().replace(/[^0-9]/g, '');
            const followers = profileCard.find('.card-meta').find('p').eq(2).text().replace(/[^0-9K]/g, '');

            profiles.push({
                name,
                username,
                avatar: imageUrl,
                numStoriesPublished: parseInt(stories),
                numFollowers: parseFloat(followers.replace('K', '')) * (followers.includes('K') ? 1000 : 1),
            });
        });*/

        return profiles.map(profile => ({
            name: profile.name,
            username: profile.username,
            avatar: profile.avatar,
            numStoriesPublished: profile.numStoriesPublished,
            numFollowers: profile.numFollowers
        }));
    } catch (error) {
        console.error('Error fetching profiles:', error.message);
        return [];
    }
}
