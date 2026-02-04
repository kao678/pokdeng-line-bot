/* =====================================================
   POKDENG LINE BOT – FINAL SELL / BULLETPROOF VERSION
   ===================================================== */

/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");
const fs = require("fs");
const path = require("path");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

/* ================== STORAGE ================== */
const DATA_DIR = path.join(__dirname, "data");
const PLAYER_FILE = path.join(DATA_DIR, "players.json");
const FINANCE_LOG_FILE = path.join(DATA_DIR, "finance-log.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PLAYER_FILE)) fs.writeFileSync(PLAYER_FILE, "{}");
if (!fs.existsSync(FINANCE_LOG_FILE)) fs.writeFileSync(FINANCE_LOG_FILE, "[]");

/* ================== PLAYER STORAGE ================== */
const readPlayers = () => {
  try {
    return JSON.parse(fs.readFileSync(PLAYER_FILE, "utf8"));
  } catch {
    return {};
  }
};

const savePlayers = data =>
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));

/* ================== FINANCE LOG ================== */
const readFinanceLog = () => {
  try {
    return JSON.parse(fs.readFileSync(FINANCE_LOG_FILE, "utf8"));
  } catch {
    return [];
  }
};

const addFinanceLog = log => {
  const logs = readFinanceLog();
  logs.push({ ...log, time: new Date().toISOString() });
  fs.writeFileSync(FINANCE_LOG_FILE, JSON.stringify(logs, null, 2));
};

/* ================== ROLE ================== */
const ADMIN_OWNER = [
  "Uab107367b6017b2b5fede655841f715c",
  "U84e79aaade836e9197263bf711348de0"
];
const ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== STATE ================== */
let game = {
  players: readPlayers()
};

/* ================== SAFE REPLY ================== */
const safeReply = async (event, msg) => {
  try {
    await client.replyMessage(event.replyToken, msg);
  } catch (e) {
    console.error("REPLY ERROR:", e.message);
  }
};

/* ================== FLEX ================== */
const flexText = (title, body) => ({
  type: "flex",
  altText: title,
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: title, weight: "bold", size: "lg" },
        { type: "separator", margin: "md" },
        { type: "text", text: body, wrap: true, margin: "md" }
      ]
    }
  }
});

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    if (event.type !== "message") continue;

    const uid = event.source.userId;
    const groupId = event.source.type === "group" ? event.source.groupId : null;

    if (!game.players[uid]) {
      game.players[uid] = {
        credit: 0,
        role: ADMIN_OWNER.includes(uid) ? "owner" : "player",
        withdrawReq: null
      };
      savePlayers(game.players);
    }

    const p = game.players[uid];

    if (groupId && p.role === "player" && !ALLOWED_GROUPS.includes(groupId)) {
      await safeReply(event, flexText("❌ ไม่ได้รับอนุญาต", ""));
      continue;
    }

    if (event.message.type !== "text") continue;
    const text = event.message.text.trim();

    /* เติมเครดิต manual */
    if (p.role !== "player" && /^\+\d+\sU/.test(text)) {
      const [amtText, targetUid] = text.split(" ");
      const amount = parseInt(amtText.replace("+", ""), 10);

      game.players[targetUid].credit += amount;
      savePlayers(game.players);

      addFinanceLog({
        type: "ADD",
        by: uid,
        target: targetUid,
        amount
      });

      await client.pushMessage(
        targetUid,
        flexText("🎁 เติมเครดิต", `+${amount}`)
      );

      await safeReply(event, flexText("✅ เติมสำเร็จ", ""));
    }
  }
  res.sendStatus(200);
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING – FINAL SELL VERSION")
);
