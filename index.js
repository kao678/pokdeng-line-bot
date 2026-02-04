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
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

/* ================== STORAGE (BULLETPROOF) ================== */
const DATA_DIR = path.join(__dirname, "data");
const PLAYER_FILE = path.join(DATA_DIR, "players.json");

/* ================== FINANCE LOG ================== */
const FINANCE_LOG_FILE = path.join(DATA_DIR, "finance-log.json");

if (!fs.existsSync(FINANCE_LOG_FILE)) {
  fs.writeFileSync(FINANCE_LOG_FILE, "[]");
}

const readFinanceLog = () => {
  try {
    return JSON.parse(fs.readFileSync(FINANCE_LOG_FILE, "utf8"));
  } catch {
    return [];
  }
};

const addFinanceLog = log => {
  const logs = readFinanceLog();
  logs.push({
    ...log,
    time: new Date().toISOString()
  });
  fs.writeFileSync(FINANCE_LOG_FILE, JSON.stringify(logs, null, 2));
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PLAYER_FILE)) fs.writeFileSync(PLAYER_FILE, "{}");

const readPlayers = () => {
  try {
    return JSON.parse(fs.readFileSync(PLAYER_FILE, "utf8"));
  } catch {
    return {};
  }
};

const savePlayers = data => {
  try {
    fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("SAVE ERROR:", e.message);
  }
};

/* ================== FINANCE CONFIG ================== */
const BANK_ACCOUNT = {
  bank: "กสิกร",
  name: "ชนากา กองสูง",
  number: "xxx-x-xxxxx-x"
};
const RECEIVER_NAMES = ["ชนากา กองสูง"];

/* ================== ROLE ================== */
const ADMIN_OWNER = [
  "Uab107367b6017b2b5fede655841f715c",
  "U84e79aaade836e9197263bf711348de0"
];
const ADMIN_SUB = [];
const ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);
const ocrClient = new vision.ImageAnnotatorClient();

/* ================== STATE ================== */
let game = {
  round: 1,
  status: "close",
  players: readPlayers(),
  tempResult: null
};

/* ================== SAFE REPLY ================== */
const safeReply = async (event, msg) => {
  try {
    await client.replyMessage(event.replyToken, msg);
  } catch (e) {
    console.error("REPLY ERROR:", e.message);
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
        { type: "text", text: body, wrap: true, margin: "md" }
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

/* ================== FLEX เติมเครดิต (ใส่จำนวนเอง) ================== */
const addCreditManualFlex = targetUid => ({
  type: "flex",
  altText: "เติมเครดิต",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "➕ เติมเครดิต (ใส่จำนวนเอง)", weight: "bold" },
        { type: "text", text: `UID:\n${targetUid}`, wrap: true, size: "sm" },
        {
          type: "button",
          style: "primary",
          action: {
            type: "message",
            label: "+500",
            text: `+500 ${targetUid}`
          }
        },
        {
          type: "button",
          style: "primary",
          action: {
            type: "message",
            label: "+1000",
            text: `+1000 ${targetUid}`
          }
        }
      ]
    }
  }
});

/* ================== FLEX อนุมัติถอน ================== */
const approveWithdrawFlex = (uid, amount) => ({
  type: "flex",
  altText: "อนุมัติถอน",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "📤 ขอถอนเครดิต", weight: "bold" },
        { type: "text", text: `UID: ${uid}\nยอด: ${amount}` },
        {
          type: "button",
          style: "primary",
          color: "#06c755",
          action: {
            type: "message",
            label: "✅ อนุมัติ",
            text: `/approve ${uid}`
          }
        }
      ]
    }
  }
});

/* ================== FINANCE LOG ================== */
const FINANCE_LOG_FILE = path.join(DATA_DIR, "finance-log.json");

if (!fs.existsSync(FINANCE_LOG_FILE)) {
  fs.writeFileSync(FINANCE_LOG_FILE, "[]");
}

const readFinanceLog = () => {
  try {
    return JSON.parse(fs.readFileSync(FINANCE_LOG_FILE, "utf8"));
  } catch {
    return [];
  }
};

const addFinanceLog = log => {
  const logs = readFinanceLog();
  logs.push({
    ...log,
    time: new Date().toISOString()
  });
  fs.writeFileSync(FINANCE_LOG_FILE, JSON.stringify(logs, null, 2));
};

/* ================== OCR ================== */
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
          pendingDeposit: false,
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

      if (text === "เมนู") return await safeReply(event, playerMenuFlex());
      if (text === "เมนูแอดมิน" && p.role !== "player")
        return await safeReply(event, adminMenuFlex());

      /* เติมเครดิต manual */
      if (p.role !== "player" && text.startsWith("เติมเอง ")) {
        const targetUid = text.replace("เติมเอง ", "").trim();
        if (!game.players[targetUid])
          return await safeReply(event, flexText("❌ ไม่พบ UID", ""));
        return await safeReply(event, addCreditManualFlex(targetUid));
      }

      if (p.role !== "player" && /^\+\d+\sU/.test(text)) {
        const [amtText, targetUid] = text.split(" ");
        const amount = parseInt(amtText.replace("+", ""), 10);
        game.players[targetUid].credit += amount;
        savePlayers(game.players);

        await client.pushMessage(
          targetUid,
          flexText("🎁 เติมเครดิต", `+${amount}\nเครดิต ${game.players[targetUid].credit}`)
        );

        return await safeReply(event, flexText("✅ เติมสำเร็จ", ""));
      }

      /* ถอน */
      if (text.startsWith("ถอน ")) {
        const amt = parseFloat(text.replace("ถอน ", ""));
        p.withdrawReq = amt;
        savePlayers(game.players);

        for (const o of ADMIN_OWNER) {
          await client.pushMessage(o, approveWithdrawFlex(uid, amt));
        }
        return await safeReply(event, flexText("⏳ รออนุมัติ", ""));
      }

      if (p.role !== "player" && text.startsWith("/approve ")) {
        const tuid = text.replace("/approve ", "").trim();
        const tp = game.players[tuid];
        tp.credit -= tp.withdrawReq;
        tp.withdrawReq = null;
        savePlayers(game.players);
        await client.pushMessage(tuid, flexText("✅ ถอนสำเร็จ", `เครดิต ${tp.credit}`));
        return await safeReply(event, flexText("อนุมัติแล้ว", ""));
      }

    } catch (e) {
      console.error("EVENT ERROR:", e);
    }
  }
  res.sendStatus(200);
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING – FINAL SELL VERSION")
);
