/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");

/* ================== FINANCE CONFIG ================== */
const FINANCE_CONFIG = {
  MIN_DEPOSIT: 300,        // ฝากขั้นต่ำ (บาท)
  MIN_WITHDRAW: 500,       // ถอนขั้นต่ำ (บาท)

  // ชื่อบัญชีผู้รับเงิน (ต้องตรงกับในสลิป)
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

const ADMIN_IDS = ["Uxxxxxxxxxxxx"]; // ใส่ LINE ID แอดมิน
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
const isAdmin = (uid) => ADMIN_IDS.includes(uid);

/* ================== CARD LOGIC ================== */
const cardPoint = c => (c >= 10 ? 0 : c);
const calcPoint = cards => cards.reduce((s, c) => s + cardPoint(c), 0) % 10;
const isDeng = cards => cards.length === 2 && calcPoint(cards) >= 8;

function compare(playerCards, bankerCards) {
  const p = calcPoint(playerCards);
  const b = calcPoint(bankerCards);

  if (isDeng(playerCards) && !isDeng(bankerCards)) return 2;
  if (!isDeng(playerCards) && isDeng(bankerCards)) return -2;
  if (p > b) return 1;
  if (p < b) return -1;
  return 0;
}

const parseResult = text =>
  text.replace("ผล", "").trim().split(",")
    .map(x => x.split("").map(n => parseInt(n)));

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
  const m = text.match(/(Transaction|TX|Ref).*?(\w+)/i);
  return m ? m[2] : null;
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
            color: "#1DB954",
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

function buildResultFlex(player) {
  const lines = Object.keys(player.results || {}).map(leg => {
    const r = player.results[leg];
    return {
      type: "text",
      text: `ขา ${leg} : ${player.bets[leg]}  ${r.icon} ${r.text}`,
      color: r.net > 0 ? "#1DB954" : r.net < 0 ? "#FF5555" : "#AAAAAA"
    };
  });

  return {
    type: "flex",
    altText: "สรุปผลป๊อกเด้ง",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `🎴 สรุปรอบ #${gameState.round}`, weight: "bold" },
          { type: "text", text: `👤 ${player.name}` },
          ...lines,
          { type: "separator" },
          { type: "text", text: `💰 เครดิต : ${player.credit}` }
        ]
      }
    }
  };
}
function matchReceiverName(ocrText) {
  return FINANCE_CONFIG.RECEIVER_NAMES.some(name =>
    ocrText.includes(name)
  );
}

/* ================== HANDLER ================== */
async function handleEvent(event) {
  try {
    // 👉 กัน webhook verify / event แปลก
    if (!event || !event.type) return null;
    if (event.type !== "message") return null;

    const uid = event.source?.userId;
    if (!uid) return null;

    // เตรียม player
    if (!gameState.players[uid]) {
      gameState.players[uid] = {
        userId: uid,
        name: uid,
        bets: {},
        results: {},
        totalBet: 0,
        winLose: 0,
        credit: 0,
        pendingDeposit: 0
      };
    }
    const p = gameState.players[uid];
    const msg = event.message;

    /* ---------- IMAGE (SLIP OCR) ---------- */
    if (msg.type === "image") {
      if (p.pendingDeposit <= 0)
        return reply(event, "❌ ไม่มีรายการฝากค้างอยู่");

      const buffer = await downloadSlip(msg.id);
      const text = await readSlipText(buffer);

      const tx = extractTX(text);
      if (tx && gameState.usedSlips.has(tx))
        return reply(event, "❌ สลิปนี้ถูกใช้ไปแล้ว");

      const amount = extractAmount(text);

if (!amount || amount <= 0)
  return reply(event, "❌ ไม่สามารถอ่านยอดเงินจากสลิปได้");

// เติมเครดิตตามยอดจริง
p.credit += amount;
p.pendingDeposit = 0;

return reply(
  event,
  `✅ ฝากเครดิตสำเร็จ\n💵 ยอดฝาก: ${amount} บาท\n💰 เครดิตปัจจุบัน: ${p.credit}`
);

      if (tx) gameState.usedSlips.add(tx);

      p.credit += amount;
      p.pendingDeposit = 0;

      return reply(event, `✅ ฝากเครดิตสำเร็จ\n💰 เครดิตปัจจุบัน: ${p.credit}`);
    }

    /* ---------- TEXT ---------- */
    if (msg.type !== "text") return null;
    const text = msg.text.trim();

    // เมนูเครดิต
    if (text === "เมนูเครดิต") return replyFlex(event, creditMenuFlex());
    if (text === "เครดิต") return reply(event, `💰 เครดิต: ${p.credit}`);

    // ฝาก (ตัวอย่างตั้งยอดตาย 1000)
    if (text === "เมนูฝาก") {
      p.pendingDeposit = -1;
      return reply(event, "📸 กรุณาแนบสลิปยอด 1,000 บาท");
    }

    // เปิด / ปิดรอบ
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

    // รับโพย
    const m = text.match(/^ขา([1-6,]+)\/(\d+)$/);
    if (m) {
      if (gameState.status !== "open")
        return reply(event, "❌ ปิดรอบแล้ว");

      const legs = m[1].split(",");
      const amt = parseInt(m[2]);
      const cost = legs.length * amt;

      if (p.credit < cost)
        return reply(event, "❌ เครดิตไม่พอ");

      p.credit -= cost;
      legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);
      return reply(event, "✅ รับโพยแล้ว");
    }

    // ใส่ผล
    if (text.startsWith("ผล") && isAdmin(uid)) {
      const cards = parseResult(text);
      const banker = cards[cards.length - 1];

      for (const id in gameState.players) {
        const pl = gameState.players[id];
        pl.results = {};
        let net = 0;

        for (const leg in pl.bets) {
          const bet = pl.bets[leg];
          const r = compare(cards[leg - 1], banker);

          let val = 0, label = "เสมอ", icon = "➖";
          if (r === 2) { val = bet * 2; label = "เด้ง"; icon = "✅"; }
          if (r === 1) { val = bet; label = "ชนะ"; icon = "✅"; }
          if (r === -1) { val = -bet; label = "แพ้"; icon = "❌"; }
          if (r === -2) { val = -bet * 2; label = "แพ้เด้ง"; icon = "❌"; }

          net += val;
          pl.results[leg] = { net: val, text: label, icon };
        }

        pl.credit += net;
        await client.pushMessage(id, buildResultFlex(pl));
      }

      return reply(event, "✅ คำนวณและส่งผลเรียบร้อย");
    }

    return null;
  } catch (err) {
    console.error("HANDLE EVENT ERROR:", err);
    return null;
  }
}

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch(err => {
      console.error("WEBHOOK ERROR:", err);
      res.status(200).end(); // ❗ สำคัญ: ห้ามส่ง 500
    });
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
