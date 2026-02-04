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

/* ================== FINANCE CONFIG ================== */
let BANK_ACCOUNT = {
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

/* 🔒 กลุ่มที่อนุญาต */
let ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== STATE ================== */
let game = {
  round: 156,
  status: "close",
  players: {},
  tempResult: null
};

let financeLog = []; // ประวัติฝาก–ถอน

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

async function readSlip(buffer) {
  const [r] = await ocrClient.textDetection({ image: { content: buffer } });
  return r.fullTextAnnotation?.text || "";
}

function extractAmount(text) {
  const m = text.replace(/,/g, "").match(/(\d+(\.\d{2})?)\s*บาท/);
  return m ? parseFloat(m[1]) : null;
}

function extractTX(text) {
  const m = text.match(/(TX|Ref|Transaction).*?([A-Z0-9]+)/i);
  return m ? m[2] : null;
}

function matchReceiver(text) {
  return RECEIVER_NAMES.some(n => text.includes(n));
}

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {

      if (event.type !== "message") continue;

      const uid = event.source.userId;
      const groupId = event.source.type === "group" ? event.source.groupId : null;

      /* BLOCK GROUP */
      if (groupId && !ALLOWED_GROUPS.includes(groupId)) {
        await reply(event, flexText("❌ ไม่ได้รับอนุญาต", "กลุ่มนี้ไม่สามารถใช้งานได้"));
        continue;
      }

      /* INIT PLAYER */
      if (!game.players[uid]) {
        let role = "player";
        if (ADMIN_OWNER.includes(uid)) role = "owner";
        else if (ADMIN_SUB.includes(uid)) role = "admin";

        game.players[uid] = {
          credit: 0,
          bets: {},
          role,
          pendingDeposit: false,
          usedSlip: new Set(),
          withdrawReq: null
        };
      }
      const p = game.players[uid];

      /* ================== IMAGE = ฝากเงิน ================== */
      if (event.message.type === "image") {
        if (!p.pendingDeposit)
          return reply(event, flexText("❌ ไม่ได้อยู่ในโหมดฝาก", "พิมพ์ เมนูฝาก ก่อน"));

        const buf = await downloadSlip(event.message.id);
        const text = await readSlip(buf);

        if (!matchReceiver(text))
          return reply(event, flexText("❌ บัญชีไม่ตรง", ""));

        const tx = extractTX(text);
        if (tx && p.usedSlip.has(tx))
          return reply(event, flexText("❌ สลิปซ้ำ", ""));

        const amount = extractAmount(text);
        if (!amount)
          return reply(event, flexText("❌ อ่านยอดไม่ได้", ""));

        p.credit += amount;
        p.pendingDeposit = false;
        if (tx) p.usedSlip.add(tx);

        financeLog.push({
          type: "deposit",
          uid,
          amount,
          time: new Date().toISOString()
        });

        return reply(event, flexText(
          "✅ ฝากสำเร็จ",
          `💵 ${amount} บาท\n💰 เครดิต ${p.credit}`
        ));
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

      /* ================== USER ================== */
      if (text === "เมนูฝาก") {
        p.pendingDeposit = true;
        return reply(event, flexText(
          "📸 ฝากเครดิต",
          `โอนเข้าบัญชี\n${BANK_ACCOUNT.bank}\n${BANK_ACCOUNT.name}\n${BANK_ACCOUNT.number}\n\nแล้วแนบสลิป`
        ));
      }

      if (text === "เครดิต")
        return reply(event, flexText("💰 เครดิต", `${p.credit}`));

      if (text.startsWith("ถอน ")) {
        const amt = parseFloat(text.replace("ถอน ", ""));
        if (!amt || amt <= 0)
          return reply(event, flexText("❌ จำนวนไม่ถูกต้อง", ""));
        if (p.credit < amt)
          return reply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.withdrawReq = amt;
        for (const o of ADMIN_OWNER) {
          await client.pushMessage(o, flexText(
            "📤 แจ้งถอน",
            `UID: ${uid}\nยอด ${amt}`
          ));
        }
        return reply(event, flexText("⏳ รออนุมัติ", `${amt} บาท`));
      }

      /* ================== ADMIN ถอน ================== */
      if (p.role !== "player" && text.startsWith("/approve ")) {
        const tuid = text.replace("/approve ", "").trim();
        const tp = game.players[tuid];
        if (!tp || !tp.withdrawReq)
          return reply(event, flexText("❌ ไม่พบรายการ", ""));

        tp.credit -= tp.withdrawReq;
        financeLog.push({
          type: "withdraw",
          uid: tuid,
          amount: tp.withdrawReq,
          time: new Date().toISOString()
        });

        await client.pushMessage(tuid, flexText(
          "✅ ถอนสำเร็จ",
          `ยอด ${tp.withdrawReq}\nเครดิตคงเหลือ ${tp.credit}`
        ));
        tp.withdrawReq = null;
        return reply(event, flexText("✅ อนุมัติแล้ว", tuid));
      }

      /* ================== GAME ================== */
      if (text === "เปิดรอบ" && (p.role === "owner" || p.role === "admin")) {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return reply(event, flexText("🟢 เปิดรอบ", `รอบ ${game.round}`));
      }

      if (text === "ปิดรอบ" && (p.role === "owner" || p.role === "admin")) {
        game.status = "close";
        return reply(event, flexText("🔴 ปิดรอบ", `รอบ ${game.round}`));
      }

      const m = text.match(/^([\d,]+)\/(\d+)$/);
      if (m && game.status === "open") {
        const legs = m[1].split(",").map(Number);
        const amt = parseInt(m[2], 10);
        const cost = legs.length * amt;

        if (p.credit < cost)
          return reply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.credit -= cost;
        legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);

        return reply(event, flexText(
          "✅ รับโพย",
          `ขา ${legs.join(",")}\nเครดิต ${p.credit}`
        ));
      }

      if (/^S/i.test(text) && (p.role === "owner" || p.role === "admin")) {
        const cards = parseResult(text);
        const banker = cards[cards.length - 1];
        const bankerPoint = calcPoint(banker);

        const legs = cards.slice(0, 6).map((c, i) => ({
          no: i + 1,
          win: compare(c, banker) > 0,
          text: `${calcPoint(c)} แต้ม`
        }));

        game.tempResult = { cards };
        return reply(event, resultFlex(game.round, bankerPoint, legs));
      }

      if ((text === "y" || text === "Y") &&
          (p.role === "owner" || p.role === "admin") &&
          game.tempResult) {

        const banker = game.tempResult.cards[6];
        let summary = [];

        for (const id in game.players) {
          const pl = game.players[id];
          let net = 0;
          for (const leg in pl.bets) {
            const r = compare(game.tempResult.cards[leg - 1], banker);
            const bet = pl.bets[leg];
            if (r === 2) net += bet * 2;
            if (r === 1) net += bet;
            if (r === -1) net -= bet;
            if (r === -2) net -= bet * 2;
          }
          pl.credit += net;
          pl.bets = {};
          summary.push(`${id} : ${pl.credit}`);
        }

        game.tempResult = null;
        return reply(event, flexText("🏆 สรุปรอบ", summary.join("\n")));
      }
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
