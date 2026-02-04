/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");
const fs = require("fs");
const path = require("path");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

/* ================== STORAGE ================== */
const DATA_PATH = path.join(__dirname, "data");
const PLAYER_FILE = path.join(DATA_PATH, "players.json");

if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH);
if (!fs.existsSync(PLAYER_FILE)) fs.writeFileSync(PLAYER_FILE, "{}");

const loadPlayers = () => JSON.parse(fs.readFileSync(PLAYER_FILE));
const savePlayers = data =>
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));

/* ================== FINANCE CONFIG ================== */
const BANK_ACCOUNT = {
  bank: "กสิกร",
  name: "ชนากา กองสูง",
  number: "xxx-x-xxxxx-x"
};
const RECEIVER_NAMES = ["ชนากา กองสูง"];

/* 👑 OWNER / ADMIN */
const ADMIN_OWNER = [
  "Uab107367b6017b2b5fede655841f715c",
  "U84e79aaade836e9197263bf711348de0"
];
let ADMIN_SUB = [];

/* 🔒 กลุ่มที่อนุญาต (player เท่านั้น) */
let ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== STATE ================== */
let game = {
  round: 1,
  status: "close",
  players: loadPlayers(),
  tempResult: null
};

/* ================== SAFE REPLY (กัน 499) ================== */
const safeReply = async (event, msg) => {
  try {
    await client.replyMessage(event.replyToken, msg);
  } catch (e) {
    console.error("Reply error:", e.message);
  }
};

/* ================== FLEX TEXT ================== */
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
        { type: "text", text: body, margin: "md", wrap: true }
      ]
    }
  }
});

/* ================== FLEX MENUS ================== */
const playerMenuFlex = () => ({
  type: "flex",
  altText: "เมนูผู้เล่น",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: "🎮 เมนูผู้เล่น", weight: "bold", size: "lg" },
        { type: "button", style: "primary", color: "#06c755",
          action: { type: "message", label: "📥 ฝากเครดิต", text: "เมนูฝาก" }},
        { type: "button",
          action: { type: "message", label: "💰 เครดิต", text: "เครดิต" }},
        { type: "button", style: "secondary",
          action: { type: "message", label: "📤 ถอนเครดิต", text: "ถอน" }}
      ]
    }
  }
});

const adminMenuFlex = () => ({
  type: "flex",
  altText: "เมนูแอดมิน",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: "👑 เมนูแอดมิน", weight: "bold", size: "lg" },
        { type: "button", style: "primary", color: "#1e90ff",
          action: { type: "message", label: "🟢 เปิดรอบ", text: "เปิดรอบ" }},
        { type: "button", style: "secondary",
          action: { type: "message", label: "🔴 ปิดรอบ", text: "ปิดรอบ" }},
        { type: "button", style: "primary", color: "#ff4757",
          action: { type: "message", label: "🏆 สรุปผล", text: "Y" }}
      ]
    }
  }
});

/* ================== OCR HELPERS ================== */
const downloadSlip = async id => {
  const url = `https://api-data.line.me/v2/bot/message/${id}/content`;
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${config.channelAccessToken}` }
  });
  return res.data;
};

const readSlip = async buffer => {
  const [r] = await ocrClient.textDetection({ image: { content: buffer } });
  return r.fullTextAnnotation?.text || "";
};

const extractAmount = text => {
  const m = text.replace(/,/g, "").match(/(\d+(\.\d{2})?)\s*บาท/);
  return m ? parseFloat(m[1]) : null;
};

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    try {
      if (event.type !== "message") continue;

      const uid = event.source.userId;
      const groupId = event.source.type === "group" ? event.source.groupId : null;

      if (!game.players[uid]) {
        game.players[uid] = {
          credit: 0,
          bets: {},
          role: ADMIN_OWNER.includes(uid) ? "owner" : "player",
          pendingDeposit: false
        };
        savePlayers(game.players);
      }
      const p = game.players[uid];

      if (groupId && p.role === "player" && !ALLOWED_GROUPS.includes(groupId)) {
        await safeReply(event, flexText("❌ ไม่ได้รับอนุญาต", ""));
        continue;
      }

      if (event.message.type === "image") {
        if (!p.pendingDeposit)
          return await safeReply(event, flexText("❌ ยังไม่ได้เลือกฝาก", ""));
        try {
          const buf = await downloadSlip(event.message.id);
          const text = await readSlip(buf);
          const amount = extractAmount(text);
          if (!amount)
            return await safeReply(event, flexText("❌ อ่านยอดไม่ได้", ""));
          p.credit += amount;
          p.pendingDeposit = false;
          savePlayers(game.players);
          return await safeReply(event, flexText("✅ ฝากสำเร็จ", `💰 ${p.credit}`));
        } catch {
          return await safeReply(event, flexText("❌ OCR Error", ""));
        }
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

      if (text === "เมนู")
        return await safeReply(event, playerMenuFlex());

      if (text === "เมนูแอดมิน" && p.role !== "player")
        return await safeReply(event, adminMenuFlex());

      if (text === "เมนูฝาก") {
        p.pendingDeposit = true;
        savePlayers(game.players);
        return await safeReply(event,
          flexText("📸 ฝากเครดิต",
            `${BANK_ACCOUNT.bank}\n${BANK_ACCOUNT.name}\n${BANK_ACCOUNT.number}`)
        );
      }

      if (text === "เครดิต")
        return await safeReply(event,
          flexText("💰 เครดิตคงเหลือ", `${p.credit}`));

    } catch (err) {
      console.error("EVENT ERROR:", err);
    }
  }
  res.sendStatus(200);
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING (BULLETPROOF)")
);
