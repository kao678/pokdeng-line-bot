/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const axios = require("axios");
const vision = require("@google-cloud/vision");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");
const { loadPlayers, savePlayers } = require("./storage");

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

/* 🔒 กลุ่มที่อนุญาต (player เท่านั้น) */
let ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== STATE ================== */
let game = {
  round: 156,
  status: "close",
  players: loadPlayers(),
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

/* ================== FLEX MENUS ================== */
// 👤 Player Menu
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
        { type: "button", style: "primary", action: { type: "message", label: "📥 ฝากเครดิต", text: "เมนูฝาก" } },
        { type: "button", action: { type: "message", label: "💰 เครดิต", text: "เครดิต" } },
        { type: "button", style: "secondary", action: { type: "message", label: "📤 ถอนเครดิต", text: "ถอน" } }
      ]
    }
  }
});

// 👑 Admin Menu
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
        { type: "button", style: "primary", action: { type: "message", label: "🟢 เปิดรอบ", text: "เปิดรอบ" } },
        { type: "button", style: "secondary", action: { type: "message", label: "🔴 ปิดรอบ", text: "ปิดรอบ" } },
        { type: "button", style: "primary", color: "#ff4757", action: { type: "message", label: "🏆 สรุปผล", text: "Y" } }
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
        savePlayers(game.players);
      }

      const p = game.players[uid];

      if (groupId && p.role === "player" && !ALLOWED_GROUPS.includes(groupId)) {
        await reply(event, flexText("❌ ไม่ได้รับอนุญาต", "กลุ่มนี้ยังไม่เปิดใช้งาน"));
        continue;
      }

      /* IMAGE = ฝาก */
      if (event.message.type === "image") {
        if (!p.pendingDeposit)
          return reply(event, flexText("❌ ยังไม่ได้เลือกฝาก", "พิมพ์ เมนูฝาก"));

        const text = await readSlip(await downloadSlip(event.message.id));

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

        savePlayers(game.players);
        return reply(event, flexText("✅ ฝากสำเร็จ", `💵 ${amount}\n💰 เครดิต ${p.credit}`));
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

      /* MENUS */
      if (text === "เมนู") {
        return reply(event, p.role === "player" ? playerMenuFlex() : adminMenuFlex());
      }

      if (text === "เมนูฝาก") {
        p.pendingDeposit = true;
        savePlayers(game.players);
        return reply(event, flexText("📸 ฝากเครดิต",
          `${BANK_ACCOUNT.bank}\n${BANK_ACCOUNT.name}\n${BANK_ACCOUNT.number}`));
      }

      if (text === "เครดิต")
        return reply(event, flexText("💰 เครดิต", `${p.credit}`));

      if (text === "ถอน")
        return reply(event, flexText("📤 ถอนเครดิต", "พิมพ์: ถอน 500"));

      if (text.startsWith("ถอน ")) {
        const amt = parseFloat(text.replace("ถอน ", ""));
        if (!amt || amt <= 0 || p.credit < amt)
          return reply(event, flexText("❌ ถอนไม่ได้", ""));

        p.withdrawReq = amt;
        savePlayers(game.players);

        for (const o of ADMIN_OWNER) {
          await client.pushMessage(o, flexText("📤 แจ้งถอน", `UID: ${uid}\nยอด ${amt}`));
        }
        return reply(event, flexText("⏳ รออนุมัติ", `${amt} บาท`));
      }

      if (p.role !== "player" && text.startsWith("/approve ")) {
        const tuid = text.replace("/approve ", "");
        const tp = game.players[tuid];
        if (!tp || !tp.withdrawReq) return;

        tp.credit -= tp.withdrawReq;
        tp.withdrawReq = null;
        savePlayers(game.players);

        await client.pushMessage(tuid,
          flexText("✅ ถอนสำเร็จ", `เครดิตคงเหลือ ${tp.credit}`));

        return reply(event, flexText("✅ อนุมัติแล้ว", tuid));
      }

      /* GAME */
      if (text === "เปิดรอบ" && p.role !== "player") {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return reply(event, flexText("🟢 เปิดรอบ", `รอบ ${game.round}`));
      }

      if (text === "ปิดรอบ" && p.role !== "player") {
        game.status = "close";
        return reply(event, flexText("🔴 ปิดรอบ", `รอบ ${game.round}`));
      }

      if ((text === "Y" || text === "y") && p.role !== "player" && game.tempResult) {
        const banker = game.tempResult.cards[6];
        let summary = [];

        for (const id in game.players) {
          const pl = game.players[id];
          let net = 0;
          for (const leg in pl.bets) {
            const r = compare(game.tempResult.cards[leg - 1], banker);
            const bet = pl.bets[leg];
            net += r === 2 ? bet * 2 : r === 1 ? bet : r === -1 ? -bet : r === -2 ? -bet * 2 : 0;
          }
          pl.credit += net;
          pl.bets = {};
          summary.push(`${id.slice(0,6)}… : ${pl.credit}`);
        }

        savePlayers(game.players);
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
  console.log("BOT RUNNING (PRODUCTION READY)")
);
