/* =====================================================
   POKDENG LINE BOT – FINAL SELL / BULLETPROOF
   FILE: index.js
   ===================================================== */

/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

/* ================== LINE CONFIG ================== */
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

const readPlayers = () => {
  try {
    return JSON.parse(fs.readFileSync(PLAYER_FILE, "utf8"));
  } catch {
    return {};
  }
};

const savePlayers = data =>
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));

const addFinanceLog = log => {
  const logs = JSON.parse(fs.readFileSync(FINANCE_LOG_FILE, "utf8"));
  logs.push({ ...log, time: new Date().toISOString() });
  fs.writeFileSync(FINANCE_LOG_FILE, JSON.stringify(logs, null, 2));
};

/* ================== ROLE CONFIG ================== */
const ADMIN_OWNER = [
  "Uab107367b6017b2b5fede655841f715c"
];

const ALLOWED_GROUPS = [
  "C682703c2206d1abb1adb7f7c2ca8284c" // ห้องเล่น
];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== GAME STATE ================== */
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

/* ================== FLEX BASIC ================== */
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
    try {
      if (event.type !== "message") continue;

      const uid = event.source.userId;
      const groupId =
        event.source.type === "group" ? event.source.groupId : null;

      /* INIT PLAYER */
      if (!game.players[uid]) {
        game.players[uid] = {
          credit: 0,
          bets: {},
          role: ADMIN_OWNER.includes(uid) ? "owner" : "player",
          withdrawReq: null
        };
        savePlayers(game.players);
      }

      const p = game.players[uid];

      /* BLOCK UNAUTHORIZED GROUP */
      if (
        groupId &&
        p.role === "player" &&
        !ALLOWED_GROUPS.includes(groupId)
      ) {
        await safeReply(event, flexText("❌ ไม่ได้รับอนุญาต", ""));
        continue;
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

      /* ================== PLAYER ================== */
      if (text === "เครดิต") {
        return await safeReply(
          event,
          flexText("💰 เครดิตของคุณ", `${p.credit}`)
        );
      }

      /* ================== MANUAL ADD CREDIT ================== */
      // +500 Uxxxx
      if (p.role !== "player" && /^\+\d+\sU/.test(text)) {
        const [amtText, targetUid] = text.split(" ");
        const amount = parseInt(amtText.replace("+", ""), 10);

        if (!game.players[targetUid])
          return await safeReply(event, flexText("❌ ไม่พบผู้เล่น", ""));

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

        return await safeReply(event, flexText("✅ เติมสำเร็จ", ""));
      }

      /* ================== WITHDRAW ================== */
      if (text.startsWith("ถอน ")) {
        const amt = parseInt(text.replace("ถอน ", ""), 10);
        if (isNaN(amt) || amt <= 0)
          return await safeReply(event, flexText("❌ จำนวนไม่ถูกต้อง", ""));
        if (p.credit < amt)
          return await safeReply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.withdrawReq = amt;
        savePlayers(game.players);

        for (const o of ADMIN_OWNER) {
          await client.pushMessage(
            o,
            flexText("📤 ขอถอน", `UID: ${uid}\nยอด: ${amt}`)
          );
        }

        return await safeReply(event, flexText("⏳ รออนุมัติ", ""));
      }

      /* ================== APPROVE WITHDRAW ================== */
      if (p.role !== "player" && text.startsWith("/approve ")) {
        const tuid = text.replace("/approve ", "").trim();
        const tp = game.players[tuid];
        if (!tp || !tp.withdrawReq)
          return await safeReply(event, flexText("❌ ไม่พบรายการ", ""));

        tp.credit -= tp.withdrawReq;

        addFinanceLog({
          type: "WITHDRAW",
          by: uid,
          target: tuid,
          amount: tp.withdrawReq
        });

        tp.withdrawReq = null;
        savePlayers(game.players);

        await client.pushMessage(
          tuid,
          flexText("✅ ถอนสำเร็จ", `เครดิต ${tp.credit}`)
        );

        return await safeReply(event, flexText("อนุมัติแล้ว", ""));
      }

      /* ================== GAME CONTROL ================== */
      if (text === "เปิดรอบ" && p.role !== "player") {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => (pl.bets = {}));
        return await safeReply(
          event,
          flexText("🟢 เปิดรอบ", `รอบ ${game.round}`)
        );
      }

      if (text === "ปิดรอบ" && p.role !== "player") {
        game.status = "close";
        return await safeReply(event, flexText("🔴 ปิดรอบ", ""));
      }

      /* ================== BET ================== */
      const m = text.match(/^([\d,]+)\/(\d+)$/);
      if (m && game.status === "open") {
        const legs = m[1].split(",").map(Number);
        const amt = parseInt(m[2], 10);
        const cost = legs.length * amt;

        if (p.credit < cost)
          return await safeReply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.credit -= cost;
        legs.forEach(l => (p.bets[l] = (p.bets[l] || 0) + amt));
        savePlayers(game.players);

        return await safeReply(
          event,
          flexText("✅ รับโพย", `หัก ${cost}\nคงเหลือ ${p.credit}`)
        );
      }

      /* ================== RESULT INPUT ================== */
      if (/^S/i.test(text) && p.role !== "player") {
        const cards = parseResult(text);
        const banker = cards[6];
        const bankerPoint = calcPoint(banker);

        const legs = cards.slice(0, 6).map((c, i) => ({
          no: i + 1,
          win: compare(c, banker) > 0,
          text: `${calcPoint(c)} แต้ม`
        }));

        game.tempResult = { cards };

        return await safeReply(
          event,
          resultFlex(game.round, bankerPoint, legs)
        );
      }

      /* ================== CONFIRM RESULT ================== */
      if ((text === "Y" || text === "y") && p.role !== "player" && game.tempResult) {
        const banker = game.tempResult.cards[6];

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
        }

        savePlayers(game.players);
        game.tempResult = null;

        return await safeReply(event, flexText("🏆 สรุปรอบ", "เรียบร้อย"));
      }

    } catch (e) {
      console.error("EVENT ERROR:", e);
    }
  }
  res.sendStatus(200);
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING – FINAL SELL")
);
