const Botly = require("botly");
const axios = require("axios");
const bodyParser = require("body-parser");
const WattpadScraper = require('wattpad-scraper');
const cheerio = require('cheerio');
const parser = require('node-html-parser');

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
    if (!users[senderId] || !users[senderId].test) {
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
    } else if (text.startsWith("topics")) {
      await handleTopics(senderId);
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
botly.on("postback", async (senderId, message, postback) => {
  console.log(`user: ${senderId} clicked: ${postback}`);
  if (postback) {
  if (postback.startsWith("username ")) {
      const username = postback.replace("username ", "").trim();
      handleProfileStories(senderId, username);
    } else if (postback.startsWith("parts ")) {
    const url = postback.replace("parts ", "").trim();
    handleParts(senderId, url);
  } else if (postback.startsWith("topics")) {
    await handleTopics(senderId);
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
    } else if (postback.startsWith("back_to_parts")) {
      const url = postback.replace("back_to_parts ", "").trim();
    if (!users[senderId]) {
        const dtparts = await getPartDetails(url)
        users[senderId] = dtparts
    }
    const userParts = users[senderId];
    if (userParts && userParts.parts) {
      userParts.currentIndex = 0;
      showMoreParts(senderId);
    } else {
      botly.sendText({ id: senderId, text: "لا توجد فصول متاحة للرجوع إليها." });
    }
  } else if (postback.startsWith("hotlist ")) {
    const topicName = postback.replace("hotlist ", "");
    handleHotlist(senderId, topicName);
  } else if (postback.startsWith("SmoreHotlist ")) {
    const parts = postback.split(" ");
    const topicName = parts[1];
    const offset = parts[2] || 0;
    handleSmoreHotlist(senderId, topicName, offset);
  } else if (postback === "fblite") {
    users[senderId] = {
      mxilite: false,
      currentIndex: 0,
      parts: [],
      test: "lol"
    };
    botly.sendText({ id: senderId, text: "اكتب اسم الرواية 📚", quick_replies: [botly.createQuickReply("اقتراحات 🔥", "topics"), botly.createQuickReply("إعادة التعيين 🔁", "Reset")] });
  } else if (postback === "mxilite") {
    users[senderId] = {
      mxilite: true,
      currentIndex: 0,
      parts: [],
      test: "lol"
    };
    botly.sendText({ id: senderId, text: "اكتب اسم الرواية 📚", quick_replies: [botly.createQuickReply("اقتراحات 🔥", "topics"), botly.createQuickReply("إعادة التعيين 🔁", "Reset")] });
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
  const response = await axios.get(`https://www.wattpad.com/v4/search/stories/?query=${query}&mature=true&limit=9fields=stories(id,title,voteCount,readCount,commentCount,description,mature,completed,cover,url,numParts,isPaywalled,paidModel,length,language(id),user(name),lastPublishedPart(createDate),promoted,sponsor(name,avatar),tags,tracking(clickUrl,impressionUrl,thirdParty(impressionUrls,clickUrls)),contest(endDate,ctaLabel,ctaURL)),total,tags,nextUrl`, {
    headers: {
      'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json',
      'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
    }
  });
   // const results = await scraper.search(query);
    const results = response.data.stories
    if (results.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = results.slice(0, 9).map((story, index) => 
          `${index + 1}. ${story.title}\nالمؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}\n الفصول: ${story.numParts}, الحالة: ${story.completed ? 'مكتملة' : 'غير مكتملة'}\n${story.description.slice(0, 30)}...`
        ).join("\n\n");

        const quickReplies = results.slice(0, 9).map(story => 
          botly.createQuickReply(story.title, `parts ${story.id}`)
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
          subtitle: `المؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}\n الفصول: ${story.numParts}, الحالة: ${story.completed ? 'مكتملة' : 'غير مكتملة'}`,
          buttons: [
            botly.createWebURLButton("اقرأ على واتباد", story.url),
            botly.createPostbackButton("عرض الفصول", `parts ${story.id}`),
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
  const response = await axios.get(url, {
    headers: {
      'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json',
      'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
    }
  });
   // const results = await scraper.search(query);
    const results = response.data.stories
    if (results.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = results.slice(0, 9).map((story, index) => 
          `${index + 1}. ${story.title}\nالمؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 30)}...`
        ).join("\n\n");

        const quickReplies = results.slice(0, 9).map(story => 
          botly.createQuickReply(story.title, `parts ${story.id}`)
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
          subtitle: `المؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 20)}...`,
          buttons: [
            botly.createWebURLButton("اقرأ على واتباد", story.url),
            botly.createPostbackButton("عرض الفصول", `parts ${story.id}`),
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
    const response = await axios.get(`https://www.wattpad.com/api/v3/stories/${url}/?fields=id,url,title,length,createDate,modifyDate,voteCount,readCount,commentCount,promoted,sponsor,language,user,description,cover,highlight_colour,completed,isPaywalled,categories,numParts,readingPosition,deleted,dateAdded,lastPublishedPart(createDate),tags,copyright,rating,story_text_url(text),,parts(id,title,voteCount,commentCount,videoId,readCount,photoUrl,modifyDate,length,voted,deleted,text_url(text),dedication)`, {
    headers: {
      'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json',
      'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
    }
  });
    //const parts = response.data.parts;
    // const parts = await getParts(url);
    const story = response.data;
    const parts = story.parts;

    if (story.cover) {
      await botly.sendImage({
        id: senderId,
        url: story.cover,
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const details = `
العنوان: ${story.title}
عدد الفصول: ${story.numParts}
التقييم: ${story.rating}
الحالة: ${story.completed ? 'مكتملة' : 'غير مكتملة'}
الوصف: ${story.description}
    `;

    await botly.sendText({
      id: senderId,
      text: details,
    }); 
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (parts.length > 0) {
      users[senderId].parts = parts;
      users[senderId].currentIndex = 0;

      const quickReplies = parts.slice(0, 7).map(part =>
        botly.createQuickReply(part.title, `read ${part.id}`)
      );
      if (parts.length > 7) {
      quickReplies.push(botly.createQuickReply("عرض المزيد", "more_parts"));
      }

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
    const startIndex = userParts.currentIndex + 7;

    if (startIndex < userParts.parts.length) {
      const quickReplies = userParts.parts.slice(startIndex, startIndex + 7).map(part =>
        botly.createQuickReply(part.title, `read ${part.id}`)
      );
      if (startIndex + 7 < userParts.parts.length) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", "more_parts"));
      } else {
        quickReplies.push(botly.createQuickReply("عودة إلى الفصول", "back_to_parts"));
      }

      userParts.currentIndex += 7;

     

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
    const response = await axios.get(`https://www.wattpad.com/apiv2/storytext?id=${url}&include_paragraph_id=1&output=json`, {
      headers: {
        'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'application/json',
        'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
      }
    });

    const restext = response.data.text;

    if (restext.length > 0) {
      const content = parser.parse(restext).textContent;
      const chunkSize = 2000;

      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        botly.sendText({ id: senderId, text: chunk });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (!users[senderId]) {
        users[senderId] = await getPartDetails(url);
      }
      
      const user = users[senderId];

      if (!user || !user.parts || user.parts.length === 0) {
        botly.sendText({ id: senderId, text: "تعذر العثور على قائمة الفصول." });
        return;
      }

      const currentIndex = user.parts.findIndex(part => String(part.id) === String(url));
      

      if (currentIndex !== -1 && currentIndex + 1 < user.parts.length) {
        const nextPart = user.parts[currentIndex + 1];

        botly.sendText({
          id: senderId,
          text: "نهاية هذا الفصل هل ترغب بالاستمرار؟",
          quick_replies: [
            botly.createQuickReply("الفصل التالي", `read ${nextPart.id}`),
            botly.createQuickReply("العودة إلى الفصول", `back_to_parts ${url}`),
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
    console.error("Error in handleRead:", error);
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
            botly.createPostbackButton("عرض الروايات", `username ${user.username}`),
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
    const response = await axios.get(`https://www.wattpad.com/v4/users/${username}/stories/published?offset=0&limit=9&fields=stories(title,lastPublishedPart,voteCount,readCount,commentCount,cover,tags,url,id,description,categories,completed,mature,rating,rankings,tagRankings,numParts,firstPartId,parts,isPaywalled,paidModel),total,nextURL`, {
      headers: {
      'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json',
      'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
      }
    });
    const stories = response.data.stories; // Assuming the API returns stories in `data.stories`
    
    if (stories.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = stories.map((story, index) => 
          `${index + 1}. ${story.title}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}\n\n${story.description.slice(0, 20)}...`
        ).join("\n\n");

        const quickReplies = stories.map(story => 
          botly.createQuickReply(story.title, `parts ${story.id}`)
        );
        // quickReplies.push(botly.createQuickReply("رجوع 🔙", "profileBack"));
        if (response.data?.nextUrl) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", `Smore ${response.data.nextUrl}`));
        }

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
            botly.createPostbackButton("عرض الفصول", `parts ${story.id}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (response.data?.nextUrl) {
        quickReplies.push(botly.createQuickReply("عرض المزيد", `Smore ${response.data.nextUrl}`));
        }
    botly.sendText({ id: senderId, text: "اذا كنت تستخدم فيسبوك لايت فلن تظهر لك القائمة، إضغط اعادة التعيين و اختر فيسبوك لايت", quick_replies: quickReplies });
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
        const response = await axios.get(`https://www.wattpad.com/v4/search/users/?query=${query}&limit=11&offset=0&fields=username,name,avatar,description,numLists,numFollowers,numStoriesPublished,badges,following`, {
          headers: {
      'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json',
      'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
          }
        });
      //console.log(response.data)
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



async function getPartDetails(id) {
    try {
        const url = `https://www.wattpad.com/v4/parts/${id}/?fields=id,title,url,modifyDate,wordCount,photoUrl,commentCount,voteCount,readCount,voted,pages,text_url,rating,group(id,title,cover,url,user(username,name,avatar,twitter,authorMessage),rating,parts(title,url,id)),source(url,label)`;
        const response = await axios.get(url, {
    headers: {
      'Accept-Language': 'ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json',
      'Cookie': 'token=503236853%3A2%3A1736640964%3AWeyYHGLHPjqwAMv5G3qdB9ActUoR63I_Bkt2hn7Jd4ZvUtVsuCISkshNVG9NIaat'
    }
  });
        const data = response.data;

        if (!data.group || !data.group.parts) {
            throw new Error("Parts list not found.");
        }

        const parts = data.group.parts.map(part => ({
            id: part.id,
            title: part.title,
            url: part.url
        }));

        const currentIndex = parts.findIndex(part => part.id === parseInt(id));

        return { currentIndex, parts };
    } catch (error) {
        console.error("Error fetching Wattpad part details:", error.message);
        return { currentIndex: -1, parts: [] };
    }
}

async function handleTopics(senderId) {
  try {
    const response = await axios.get(
      "https://www.wattpad.com/v5/browse/topics?language=16&fields=topics(name,categoryID,browseURL,tagURL)",
      {
        headers: {
          "Accept-Language": "ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
          Accept: "application/json",
        },
      }
    );

    const topics = response.data.topics;

    if (topics.length > 0) {
      // اختيار 10 مواضيع بشكل عشوائي
      const randomTopics = topics.sort(() => Math.random() - 0.5).slice(0, 10);

      const quickReplies = randomTopics.map((topic) =>
        botly.createQuickReply(topic.topic, `hotlist ${topic.name}`)
      );

      botly.sendText({
        id: senderId,
        text: "اختر موضوعًا لرؤية القصص الرائجة:",
        quick_replies: quickReplies,
      });
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على مواضيع." });
    }
  } catch (error) {
    console.error("Error fetching topics:", error);
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء جلب المواضيع." });
  }
}


async function handleHotlist(senderId, topicName, offset = 0) {
  try {
    const response = await axios.get(
      `https://api.wattpad.com/v5/hotlist?tags=${encodeURIComponent(topicName)}&language=16&offset=${offset}&limit=10&fields=stories(id,title,voteCount,readCount,commentCount,tags,user(name,username,avatar),description,cover,completed,rating,mature,url,numParts,modifyDate,categories,firstPartId),total,nextUrl`,
      {
        headers: {
          "Accept-Language": "ar-MA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
          Accept: "application/json",
        },
      }
    );

    const results = response.data.stories;

    if (results.length > 0) {
      const ismxiLite = users[senderId]?.mxilite;

      if (!ismxiLite) {
        let storyDetails = results
          .map(
            (story, index) =>
              `${index + 1}. ${story.title}\nالمؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 30)}...`
          )
          .join("\n\n");

        const quickReplies = results.map((story) =>
          botly.createQuickReply(story.title, `parts ${story.id}`)
        );

        if (response.data?.nextUrl) {
          quickReplies.push(
            botly.createQuickReply("عرض المزيد", `SmoreHotlist ${topicName} ${offset + 10}`)
          );
        }

        botly.sendText({
          id: senderId,
          text: `${storyDetails}\n\nحدد الرواية:`,
          quick_replies: quickReplies,
        });
      } else {
        const elements = results.map((story) => ({
          title: story.title,
          image_url: story.cover,
          subtitle: `المؤلف: ${story.user.name}\nقراءات: ${story.readCount}, إعجابات: ${story.voteCount}, الفصول: ${story.numParts}\n${story.description.slice(0, 20)}...`,
          buttons: [
            botly.createWebURLButton("اقرأ على واتباد", story.url),
            botly.createPostbackButton("عرض الفصول", `parts ${story.id}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });

        await new Promise((resolve) => setTimeout(resolve, 3000));


        if (response.data?.nextUrl) {
          quickReplies.push(
            botly.createQuickReply("عرض المزيد", `SmoreHotlist ${topicName} ${offset + 10}`)
          );
        }

        botly.sendText({
          id: senderId,
          text: "اذا كنت تستخدم فيسبوك لايت فلن تظهر لك القائمة، إضغط اعادة التعيين و اختر فيسبوك لايت",
          quick_replies: quickReplies,
        });
      }
    } else {
      botly.sendText({ id: senderId, text: "لم يتم العثور على قصص رائجة لهذا الموضوع." });
    }
  } catch (error) {
    console.error("Error fetching hotlist:", error);
    botly.sendText({ id: senderId, text: "عذراً، حدث خطأ أثناء جلب القصص الرائجة." });
  }
}

async function handleSmoreHotlist(senderId, topicName, offset) {
  await handleHotlist(senderId, topicName, parseInt(offset));
}
