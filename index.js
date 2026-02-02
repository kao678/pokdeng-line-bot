const express = require("express");
const line = require("@line/bot-sdk");

const gamePokdeng = require("./game.pokdeng");
const finance = require("./finance");

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const ADMIN_OWNER = ["Uab107367b6017b2b5fede655841f715c"];
let ADMIN_SUB = [];
let ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

const app = express();
const client = new line.Client(config);

let game = {
  round: 1,
  status: "close",
  players: {},
  tempResult: null
};

const reply = (event, msg) =>
  client.replyMessage(event.replyToken, msg);

const flexText = (title, body) => ({
  type: "flex",
  altText: title,
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: title, weight: "bold" },
        { type: "text", text: body, wrap: true }
      ]
    }
  }
});

app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    if (event.type !== "message") continue;

    const uid = event.source.userId;

    if (!game.players[uid]) {
      game.players[uid] = {
        credit: 2000,
        bets: {},
        pendingDeposit: false,
        usedSlips: new Set(),
        historyDeposit: [],
        withdraw: null,
        role: ADMIN_OWNER.includes(uid)
          ? "owner"
          : ADMIN_SUB.includes(uid)
          ? "admin"
          : "player",
        lineName: uid
      };
    }

    // ลองให้ finance จัดการก่อน
    const handledFinance = await finance.handle(
      event, game, client, reply, flexText, config.channelAccessToken
    );
    if (handledFinance !== false) continue;

    // ถ้าไม่ใช่ finance → ส่งให้เกม
    await gamePokdeng.handle(event, game, client, reply, flexText);
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING")
);
