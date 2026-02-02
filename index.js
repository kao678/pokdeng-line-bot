/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

/* ================== FINANCE ================== */
let FINANCE = {
  RECEIVER_NAMES: ["นาง ชนากา กองสูง", "ชนากา กองสูง"]
};

/* 👑 OWNER */
const ADMIN_OWNER = ["Uab107367b6017b2b5fede655841f715c"];
let ADMIN_SUB = [];
let ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== GAME STATE ================== */
let game = {
  round: 156,
  status: "close",
  players: {},
  tempResult: null
};

/* ================== UTILS ================== */
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
        { type: "text", text: title, weight: "bold", size: "lg" },
        { type: "separator", margin: "md" },
        { type: "text", text: body, margin: "md", wrap: true }
      ]
    }
  }
});

/* ================== OCR HELPERS ================== */
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

const extractAmount = text =>
  (text.replace(/,/g, "").match(/(\d+(\.\d{2})?)\s*บาท/) || [])[1];

const extractTX = text =>
  (text.match(/(TX|Ref|Transaction).*?([A-Z0-9]+)/i) || [])[2];

const matchReceiver = text =>
  FINANCE.RECEIVER_NAMES.some(n => text.includes(n));

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {

      if (event.type !== "message") continue;
      const uid = event.source.userId;

      if (!game.players[uid]) {
        game.players[uid] = {
          credit: 0,
          bets: {},
          pendingDeposit: false,
          usedSlips: new Set(),
          withdraw: null,
          historyDeposit: [],
          historyWithdraw: [],
          role: ADMIN_OWNER.includes(uid)
            ? "owner"
            : ADMIN_SUB.includes(uid)
            ? "admin"
            : "player"
        };
      }
      const p = game.players[uid];

      /* ========== IMAGE = ฝาก ========== */
      if (event.message.type === "image") {
        if (!p.pendingDeposit)
          return reply(event, flexText("❌ ไม่มีรายการฝาก", "พิมพ์ เมนูฝาก ก่อน"));

        const buffer = await downloadSlip(event.message.id);
        const text = await readSlipText(buffer);

        if (!matchReceiver(text))
          return reply(event, flexText("❌ บัญชีไม่ตรง", FINANCE.RECEIVER_NAMES.join("\n")));

        const tx = extractTX(text);
        if (tx && p.usedSlips.has(tx))
          return reply(event, flexText("❌ สลิปซ้ำ", ""));

        const amount = parseFloat(extractAmount(text));
        if (!amount)
          return reply(event, flexText("❌ อ่านยอดไม่ได้", ""));

        p.credit += amount;
        p.pendingDeposit = false;
        p.usedSlips.add(tx);
        p.historyDeposit.push({ amount, time: new Date() });

        return reply(event, flexText(
          "✅ ฝากสำเร็จ",
          `💵 ${amount}\n💰 เครดิต ${p.credit}`
        ));
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

      /* ================= USER ================= */
      if (text === "เมนูฝาก") {
        p.pendingDeposit = true;
        return reply(event, flexText("📸 ฝากเครดิต", "แนบสลิปได้เลย"));
      }

      if (text === "เครดิต")
        return reply(event, flexText("💰 เครดิต", `${p.credit}`));

      if (text === "ประวัติฝาก")
        return reply(event, flexText(
          "📊 ประวัติฝาก",
          p.historyDeposit.map(x => `+${x.amount}`).join("\n") || "-"
        ));

      if (text === "ประวัติถอน")
        return reply(event, flexText(
          "📊 ประวัติถอน",
          p.historyWithdraw.map(x => `-${x.amount}`).join("\n") || "-"
        ));

      /* ================= ถอน ================= */
      if (text.startsWith("ถอน ")) {
        const amt = parseFloat(text.replace("ถอน ", ""));
        if (p.credit < amt)
          return reply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.withdraw = amt;
        ADMIN_OWNER.forEach(a =>
          client.pushMessage(a, flexText(
            "📤 ขอถอน",
            `UID: ${uid}\nยอด: ${amt}\nพิมพ์: อนุมัติถอน ${uid}`
          ))
        );

        return reply(event, flexText("⏳ รอแอดมิน", ""));
      }

      /* ============ ADMIN ถอน ============ */
      if (p.role !== "player" && text.startsWith("อนุมัติถอน ")) {
        const tid = text.replace("อนุมัติถอน ", "");
        const tp = game.players[tid];
        if (!tp || !tp.withdraw) return;

        tp.credit -= tp.withdraw;
        tp.historyWithdraw.push({ amount: tp.withdraw, time: new Date() });
        tp.withdraw = null;

        return reply(event, flexText("✅ อนุมัติถอนแล้ว", ""));
      }

      if (p.role !== "player" && text.startsWith("ยกเลิกถอน ")) {
        const tid = text.replace("ยกเลิกถอน ", "");
        const tp = game.players[tid];
        if (!tp || !tp.withdraw) return;

        tp.withdraw = null;
        return reply(event, flexText("❌ ยกเลิกถอนแล้ว", ""));
      }

      /* ============ ADMIN ตั้งบัญชี ============ */
      if (p.role !== "player" && text.startsWith("ตั้งบัญชี ")) {
        FINANCE.RECEIVER_NAMES = [text.replace("ตั้งบัญชี ", "").trim()];
        return reply(event, flexText("🏦 ตั้งบัญชีแล้ว", FINANCE.RECEIVER_NAMES[0]));
      }

      if (text === "บัญชีรับโอน")
        return reply(event, flexText("🏦 บัญชีรับโอน", FINANCE.RECEIVER_NAMES.join("\n")));
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING")
);
