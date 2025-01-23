const Botly = require("botly");
const axios = require("axios");
const bodyParser = require("body-parser");

// Initialize Botly with your Facebook page token and verify 
const botly = new Botly({
  accessToken: process.env.FBTOKEN,
  verifyToken: "abcd1234",
});

const users = {};

// Handle incoming messages

botly.on("message", async (senderId, message, data) => {
  console.log(message)
  if (data.text || message.message.text) {
    const text = message.message.text;
    console.log(`user: ${senderId} said: ${text}`)
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

    if (text.startsWith("parts ")) {
      const url = text.replace("parts ", "").trim();
      await handleParts(senderId, url);
    } else if (text.startsWith("read ")) {
      const url = text.replace("read ", "").trim();
      await handleRead(senderId, url);
    } else if (text.startsWith("/reset") {
      delete users[senderId]
    } else {
        await handleSearch(senderId, text);
    }
  }
});


// Webhook setup
botly.on("postback", (senderId, message, postback) => {
  console.log(`user: ${senderId} clicked: ${postback}`);
  if (postback) {
  if (postback.startsWith("parts ")) {
    const url = postback.replace("parts ", "").trim();
    handleParts(senderId, url);
  } else if (postback.startsWith("read ")) {
    const url = postback.replace("read ", "").trim();
    handleRead(senderId, url);
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
      botly.sendText({ id: senderId, text: "No chapters available to go back." });
    }
  } else if (postback === "fblite") {
    users[senderId] = {
      mxilite: false,
      currentIndex: 0,
      parts: [],
    };
    botly.sendText({ id: senderId, text: "عن اي رواية تبحث عنها؟"});
  } else if (postback === "mxilite") {
    users[senderId] = {
      mxilite: true,
      currentIndex: 0,
      parts: [],
    };
    botly.sendText({ id: senderId, text: "عن اي رواية تبحث؟"});
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
    const response = await axios.get(`https://myapi.ddns.net/api/search/wattpad/search?q=${query}`);
    const results = response.data;

    if (results.length > 0) {
      const ismxiLite = users[senderId].mxilite;

      if (!ismxiLite) {
        let storyDetails = results.slice(0, 7).map((story, index) => 
          `${index + 1}. ${story.title}\nقراءات: ${story.reads}, إعجابات: ${story.votes}`
        ).join("\n\n");

        const quickReplies = results.slice(0, 7).map(story => 
          botly.createQuickReply(story.title, `parts ${story.link}`)
        );

        botly.sendText({
          id: senderId,
          text: `${storyDetails}\n\nحدد الرواية:`,
          quick_replies: quickReplies,
        });
      } else {
        const elements = results.slice(0, 7).map(story => ({
          title: story.title,
          image_url: story.thumbnail,
          subtitle: `Reads: ${story.reads}, Votes: ${story.votes}`,
          buttons: [
            botly.createWebURLButton("اقرأ على واتباد", story.link),
            botly.createPostbackButton("عرض الفصول", `parts ${story.link}`),
          ],
        }));

        botly.sendGeneric({ id: senderId, elements });
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
    const response = await axios.get(`https://myapi.ddns.net/api/search/wattpad/parts?&url=${url}`);
    const parts = response.data;

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

function showMoreParts(senderId) {
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
      botly.sendText({ id: senderId, text: "لا توجد فصول أخرى متاحة." });
    }
  } else {
    botly.sendText({ id: senderId, text: "لا توجد فصول متاحة لإظهار المزيد." });
  }
}

async function handleRead(senderId, url) {
  try {
    const response = await axios.get(`https://myapi.ddns.net/api/search/wattpad/read?url=${url}`);
    const pages = response.data;

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
