/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const ADMIN_IDS = ["Uxxxxxxxxxxxx"]; // ใส่ LINE ID แอดมิน

/* ================== FINANCE CONFIG ================== */
const FINANCE_CONFIG = {
  MIN_DEPOSIT: 300,
  RECEIVER_NAMES: ["นาง ชนากา กองสูง", "ชนากา กองสูง"]
};

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== GAME STATE ================== */
let gameState = {
  round: 0,
  status: "close",
  players: {},
  usedSlips: new Set()
};

/* ================== UTILS ================== */
const isAdmin = uid => ADMIN_IDS.includes(uid);
const reply = (event, text) =>
  client.replyMessage(event.replyToken, { type: "text", text });

/* ================== POK DENG LOGIC ================== */
const cardPoint = c => (c >= 10 ? 0 : c);
const calcPoint = cards => cards.reduce((s, c) => s + cardPoint(c), 0) % 10;
const isDeng = cards => cards.length === 2 && calcPoint(cards) >= 8;

function compare(playerCards, bankerCards) {
  const p = calcPoint(playerCards);
  const b = calcPoint(bankerCards);
  const pd = isDeng(playerCards);
  const bd = isDeng(bankerCards);

  if (pd && !bd) return 2;
  if (!pd && bd) return -2;
  if (p > b) return 1;
  if (p < b) return -1;
  return 0;
}

function parseResult(text) {
  return text
    .replace("ผล", "")
    .trim()
    .split(",")
    .map(x => x.split("").map(n => parseInt(n)));
}

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

/* ================== HANDLER ================== */
async function handleEvent(event) {
  if (!event || event.type !== "message") return null;
  const uid = event.source?.userId;
  if (!uid) return null;

  if (!gameState.players[uid]) {
    gameState.players[uid] = {
      credit: 0,
      bets: {},
      pendingDeposit: false
    };
  }

  const p = gameState.players[uid];
  const msg = event.message;

  /* ===== IMAGE (SLIP) ===== */
  if (msg.type === "image") {
    const buffer = await downloadSlip(msg.id);
    const text = await readSlipText(buffer);

    if (!matchReceiverName(text))
      return reply(event, "❌ ชื่อบัญชีไม่ตรง");

    const tx = extractTX(text);
    if (tx && gameState.usedSlips.has(tx))
      return reply(event, "❌ สลิปซ้ำ");

    const amount = extractAmount(text);
    if (!amount || amount < FINANCE_CONFIG.MIN_DEPOSIT)
      return reply(event, `❌ ฝากขั้นต่ำ ${FINANCE_CONFIG.MIN_DEPOSIT} บาท`);

    p.credit += amount;
    p.pendingDeposit = false;
    if (tx) gameState.usedSlips.add(tx);

    return reply(
      event,
      `✅ ฝากเครดิตสำเร็จ\n💵 ${amount} บาท\n💰 เครดิต: ${p.credit}`
    );
  }

  if (msg.type !== "text") return null;
  const text = msg.text.trim();

  /* ===== USER ===== */
  if (text === "เมนูฝาก")
    return reply(event, "📸 กรุณาแนบสลิปโอนเงิน");

  if (text === "เครดิต")
    return reply(event, `💰 เครดิต: ${p.credit}`);

  /* ===== BET ===== */
  // รับโพย (รองรับ 1,3/100 และ ขา1,3/100)
const m = text.match(/^(?:ขา)?([1-6](?:,[1-6])*)\/(\d+)$/);
if (m) {
  if (gameState.status !== "open")
    return reply(event, "❌ ปิดรอบแล้ว");

  const legs = m[1].split(",").map(Number);
  const amt = parseInt(m[2], 10);
  const cost = legs.length * amt;

  if (amt <= 0)
    return reply(event, "❌ จำนวนเงินไม่ถูกต้อง");

  if (p.credit < cost)
    return reply(event, "❌ เครดิตไม่พอ");

  p.credit -= cost;

  legs.forEach(l => {
    p.bets[l] = (p.bets[l] || 0) + amt;
  });

  return reply(
    event,
    `✅ รับโพยแล้ว\n🎯 ขา: ${legs.join(",")}\n💵 ขาละ: ${amt}\n💰 เครดิตคงเหลือ: ${p.credit}`
  );
}

  /* ===== ADMIN ===== */
  if (text === "เปิดรอบ" && isAdmin(uid)) {
    gameState.round++;
    gameState.status = "open";
    gameState.players = {};
    return reply(event, `🟢 เปิดรอบ #${gameState.round}`);
  }

  if (text === "ปิดรอบ" && isAdmin(uid)) {
    gameState.status = "close";
    return reply(event, `🔴 ปิดรอบ #${gameState.round}`);
  }

  if (text.startsWith("ผล") && isAdmin(uid)) {
    const cards = parseResult(text);
    const banker = cards[cards.length - 1];

    for (const id in gameState.players) {
      const pl = gameState.players[id];
      let net = 0;
      let msg = `🎴 ผลรอบ #${gameState.round}\n`;

      for (const leg in pl.bets) {
        const r = compare(cards[leg - 1], banker);
        const betAmt = pl.bets[leg];
        let val = 0;

        if (r === 2) val = betAmt * 2;
        if (r === 1) val = betAmt;
        if (r === -1) val = -betAmt;
        if (r === -2) val = -betAmt * 2;

        net += val;
        msg += `ขา ${leg} : ${val}\n`;
      }

      pl.credit += net;
      pl.bets = {};
      msg += `💰 คงเหลือ ${pl.credit}`;
      await client.pushMessage(id, { type: "text", text: msg });
    }

    return reply(event, "✅ สรุปผลเรียบร้อย");
  }

  return null;
}

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  await Promise.all(req.body.events.map(handleEvent));
  res.status(200).end();
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING")
);
