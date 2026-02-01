/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");

/* ================== FINANCE CONFIG ================== */
const FINANCE_CONFIG = {
  MIN_DEPOSIT: 300,
  RECEIVER_NAMES: [
    "นาง ชนากา กองสูง",
    "ชนากา กองสูง"
  ]
};

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const ADMIN_IDS = ["Uxxxxxxxxxxxx"];
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();
const app = express();

/* ================== GAME STATE ================== */
let gameState = {
  round: 0,
  status: "close",
  players: {},
  usedSlips: new Set()
};

/* ================== UTILS ================== */
const isAdmin = uid => ADMIN_IDS.includes(uid);

/* ================== OCR ================== */
async function downloadSlip(messageId) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${config.channelAccessToken}` }
  });
  return res.data;
}

async function readSlipText(buffer) {
  const [result] = await ocrClient.textDetection({ image: { content: buffer } });
  return result.fullTextAnnotation?.text || "";
}

function extractAmount(text) {
  const m = text.replace(/,/g, "").match(/(\d+(\.\d{2})?)\s*บาท/);
  return m ? parseFloat(m[1]) : null;
}

function extractTX(text) {
  const m = text.match(/(TX|Transaction|Ref).*?([A-Za-z0-9]+)/i);
  return m ? m[2] : null;
}

function matchReceiverName(text) {
  return FINANCE_CONFIG.RECEIVER_NAMES.some(name => text.includes(name));
}

/* ================== FLEX ================== */
function creditMenuFlex() {
  return {
    type: "flex",
    altText: "เมนูเครดิต",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "💰 เมนูเครดิต", weight: "bold", size: "lg" },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "📥 ฝากเครดิต", text: "เมนูฝาก" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "💳 เช็คเครดิต", text: "เครดิต" }
          }
        ]
      }
    }
  };
}

/* ================== HANDLER ================== */
async function handleEvent(event) {
  try {
    if (!event || event.type !== "message") return null;
    const uid = event.source?.userId;
    if (!uid) return null;

    if (!gameState.players[uid]) {
      gameState.players[uid] = { credit: 0 };
    }
    const p = gameState.players[uid];
    const msg = event.message;

    // ---------- IMAGE (SLIP) ----------
    if (msg.type === "image") {
      const buffer = await downloadSlip(msg.id);
      const text = await readSlipText(buffer);

      if (!matchReceiverName(text))
        return reply(event, "❌ ชื่อบัญชีปลายทางไม่ถูกต้อง");

      const tx = extractTX(text);
      if (tx && gameState.usedSlips.has(tx))
        return reply(event, "❌ สลิปนี้ถูกใช้ไปแล้ว");

      const amount = extractAmount(text);
      if (!amount || amount < FINANCE_CONFIG.MIN_DEPOSIT)
        return reply(event, `❌ ฝากขั้นต่ำ ${FINANCE_CONFIG.MIN_DEPOSIT} บาท`);

      if (tx) gameState.usedSlips.add(tx);
      p.credit += amount;

      return reply(
        event,
        `✅ ฝากเครดิตสำเร็จ\n💵 ${amount} บาท\n💰 เครดิตปัจจุบัน: ${p.credit}`
      );
    }

    // ---------- TEXT ----------
    if (msg.type !== "text") return null;
    const text = msg.text.trim();

    if (text === "เมนูเครดิต") return replyFlex(event, creditMenuFlex());
    if (text === "เครดิต") return reply(event, `💰 เครดิต: ${p.credit}`);
    if (text === "เมนูฝาก")
      return reply(event, "📸 แนบสลิปโอนได้ทันที (ระบบอัตโนมัติ)");

    return null;
  } catch (err) {
    console.error("HANDLE ERROR:", err);
    return null;
  }
}

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch(() => res.status(200).end());
});

/* ================== REPLY ================== */
const reply = (event, text) =>
  client.replyMessage(event.replyToken, { type: "text", text });

const replyFlex = (event, flex) =>
  client.replyMessage(event.replyToken, flex);

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING")
);
