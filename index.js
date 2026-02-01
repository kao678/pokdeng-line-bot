/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");

/* ================== FINANCE CONFIG ================== */
const FINANCE_CONFIG = {
  MIN_DEPOSIT: 300,
  MIN_WITHDRAW: 500,
  RECEIVER_NAMES: [
    "นาง ชนากา กองสูง",
    "ชนากา กองสูง"
  ]
};

/* ================== LINE CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const ADMIN_IDS = ["Uxxxxxxxxxxxx"]; // 🔴 ใส่ ID แอดมิน
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== APP ================== */
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

/* ================== POKDENG LOGIC ================== */
const cardPoint = c => (c >= 10 ? 0 : c);
const calcPoint = cards => cards.reduce((s, c) => s + cardPoint(c), 0) % 10;
const isDeng = cards => cards.length === 2 && calcPoint(cards) >= 8;

function compare(pCards, bCards) {
  const p = calcPoint(pCards);
  const b = calcPoint(bCards);
  if (isDeng(pCards) && !isDeng(bCards)) return 2;
  if (!isDeng(pCards) && isDeng(bCards)) return -2;
  if (p > b) return 1;
  if (p < b) return -1;
  return 0;
}

const parseResult = text =>
  text.replace(/^S/i, "").split(",").map(x =>
    x.split("").map(n => parseInt(n))
  );

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
  const m = text.match(/(TX|Ref|Transaction).*?([A-Z0-9]+)/i);
  return m ? m[2] : null;
}

function matchReceiverName(text) {
  return FINANCE_CONFIG.RECEIVER_NAMES.some(n => text.includes(n));
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
        contents: [
          { type: "text", text: "💰 เมนูเครดิต", weight: "bold" },
          { type: "button", style: "primary", action: { type: "message", label: "ฝากเครดิต", text: "เมนูฝาก" }},
          { type: "button", style: "secondary", action: { type: "message", label: "ถอนเครดิต", text: "ถอน" }},
          { type: "button", style: "secondary", action: { type: "message", label: "เช็คเครดิต", text: "เครดิต" }}
        ]
      }
    }
  };
}

/* ================== HANDLER ================== */
async function handleEvent(event) {
  if (!event || event.type !== "message") return null;
  const uid = event.source.userId;

  if (!gameState.players[uid]) {
    gameState.players[uid] = {
      credit: 0,
      bets: {},
      pendingDeposit: false,
      pendingWithdraw: false
    };
  }
  const p = gameState.players[uid];
  const msg = event.message;

  /* ---------- IMAGE = SLIP ---------- */
  if (msg.type === "image") {
    if (!p.pendingDeposit) return reply(event, "❌ ไม่มีรายการฝากค้างอยู่");

    const buffer = await downloadSlip(msg.id);
    const text = await readSlipText(buffer);

    if (!matchReceiverName(text))
      return reply(event, "❌ ชื่อบัญชีไม่ถูกต้อง");

    const tx = extractTX(text);
    if (tx && gameState.usedSlips.has(tx))
      return reply(event, "❌ สลิปซ้ำ");

    const amount = extractAmount(text);
    if (!amount || amount < FINANCE_CONFIG.MIN_DEPOSIT)
      return reply(event, "❌ ยอดฝากไม่ถูกต้อง");

    p.credit += amount;
    p.pendingDeposit = false;
    if (tx) gameState.usedSlips.add(tx);

    return reply(event, `✅ ฝากสำเร็จ ${amount} บาท\n💰 เครดิต: ${p.credit}`);
  }

  if (msg.type !== "text") return null;
  const text = msg.text.trim();

  /* ---------- CREDIT ---------- */
  if (text === "เมนูเครดิต") return replyFlex(event, creditMenuFlex());
  if (text === "เครดิต") return reply(event, `💰 เครดิต: ${p.credit}`);

  if (text === "เมนูฝาก") {
    p.pendingDeposit = true;
    return reply(event, "📸 กรุณาแนบสลิปโอนเงิน");
  }

  if (text === "ถอน") {
    if (p.credit < FINANCE_CONFIG.MIN_WITHDRAW)
      return reply(event, "❌ เครดิตไม่ถึงขั้นต่ำถอน");
    p.pendingWithdraw = true;
    return reply(event, "📩 แอดมินจะตรวจสอบการถอน");
  }

  /* ---------- GAME ---------- */
  if (text === "เปิดรอบ" && isAdmin(uid)) {
    gameState.round++;
    gameState.status = "open";
    for (const id in gameState.players) {
      gameState.players[id].bets = {};
    }
    return reply(event, `🎴 เปิดรอบ #${gameState.round}`);
  }

  if (text === "ปิดรอบ" && isAdmin(uid)) {
    gameState.status = "close";
    return reply(event, `❌ ปิดรอบ #${gameState.round}`);
  }

  const betMatch = text.match(/^([1-6,]+)\/(\d+)$/);
  if (betMatch && gameState.status === "open") {
    const legs = betMatch[1].split(",");
    const amt = parseInt(betMatch[2]);
    const cost = legs.length * amt;
    if (p.credit < cost) return reply(event, "❌ เครดิตไม่พอ");

    p.credit -= cost;
    legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);
    return reply(event, "✅ รับโพยแล้ว");
  }

  if (text.startsWith("S") && isAdmin(uid)) {
    const cards = parseResult(text);
    const banker = cards[cards.length - 1];

    for (const id in gameState.players) {
      const pl = gameState.players[id];
      let net = 0;

      for (const leg in pl.bets) {
        const r = compare(cards[leg - 1], banker);
        const bet = pl.bets[leg];
        if (r === 2) net += bet * 2;
        if (r === 1) net += bet;
        if (r === -1) net -= bet;
        if (r === -2) net -= bet * 2;
      }

      pl.credit += net;
      await client.pushMessage(id, {
        type: "text",
        text: `🎴 สรุปรอบ #${gameState.round}\n💰 ผลสุทธิ: ${net}\nเครดิตคงเหลือ: ${pl.credit}`
      });
    }
    return reply(event, "✅ คำนวณผลเรียบร้อย");
  }

  return null;
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
