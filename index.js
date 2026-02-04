/* =====================================================
   POKDENG LINE BOT – FINAL SELL / BULLETPROOF VERSION
   ===================================================== */

/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const {
  playerMenuFlex,
  adminMenuFlex,
  resultPreviewFlex,
  resultSummaryFlex,
  addCreditManualFlex,
  approveWithdrawFlex,
  flexText,
  checkIdFlex
   } = require("./flex");

/* ================== CONFIG ================== */
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
  try { return JSON.parse(fs.readFileSync(PLAYER_FILE)); }
  catch { return {}; }
};
const savePlayers = d =>
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(d, null, 2));

const readFinanceLog = () => {
  try { return JSON.parse(fs.readFileSync(FINANCE_LOG_FILE)); }
  catch { return []; }
};
const addFinanceLog = log => {
  const logs = readFinanceLog();
  logs.push({ ...log, time: new Date().toISOString() });
  fs.writeFileSync(FINANCE_LOG_FILE, JSON.stringify(logs, null, 2));
};

/* ================== ROLE ================== */
const ADMIN_OWNER = [
  "Uab107367b6017b2b5fede655841f715c",
  "U84e79aaade836e9197263bf711348de0"
];

/* ================== ROOMS ================== */
// 🎮 ห้องเล่นเกม
const PLAY_ROOM_IDS = [
  "Cxxxxxxxxxxxxxxxx_play"
];

// 💰 ห้องฝากถอน
const FINANCE_ROOM_IDS = [
  "Cxxxxxxxxxxxxxxxx_money"
];
const ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== STATE ================== */
let game = {
  round: 1,
  status: "close",
  players: readPlayers(),
  tempResult: null
};

/* ================== SAFE REPLY ================== */
const safeReply = async (event, msg) => {
  try { await client.replyMessage(event.replyToken, msg); }
  catch (e) { console.error("REPLY ERROR:", e.message); }
};

/* ================== ROOM CHECK ================== */
const isPlayRoom = source =>
  source.type === "group" && PLAY_ROOM_IDS.includes(source.groupId);

const isFinanceRoom = source =>
  source.type === "group" && FINANCE_ROOM_IDS.includes(source.groupId);

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    try {
      if (event.type !== "message") continue;

      const uid = event.source.userId;
      const groupId = event.source.type === "group"
        ? event.source.groupId
        : null;

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

      /* BLOCK GROUP */
      if (groupId && p.role === "player" && !ALLOWED_GROUPS.includes(groupId)) {
        await safeReply(event, flexText("❌ ไม่ได้รับอนุญาต", ""));
        continue;
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

       /* ===== BLOCK GAME COMMAND IN WRONG ROOM ===== */
if (
  ["เปิดรอบ", "ปิดรอบ"].includes(text) ||
  /^([\d,]+)\/(\d+)$/.test(text) ||
  /^S/i.test(text) ||
  text === "Y" || text === "y"
) {
  if (!isPlayRoom(event.source)) {
    return await safeReply(
      event,
      flexText("🚫 ห้องไม่ถูกต้อง", "คำสั่งนี้ใช้ได้เฉพาะ 🎮 ห้องเล่น")
    );
  }
}
       /* ===== BLOCK FINANCE COMMAND IN WRONG ROOM ===== */
if (
  text.startsWith("ถอน") ||
  text.startsWith("/approve") ||
  text.startsWith("เติมเอง") ||
  /^\+\d+\sU/.test(text)
) {
  if (!isFinanceRoom(event.source)) {
    return await safeReply(
      event,
      flexText("🚫 ห้องไม่ถูกต้อง", "คำสั่งนี้ใช้ได้เฉพาะ 💰 ห้องฝากถอน")
    );
  }
}

      /* ===== MENUS ===== */
      if (text === "เมนู")
        return await safeReply(event, playerMenuFlex());
      if (text === "เมนูแอดมิน" && p.role !== "player")
        return await safeReply(event, adminMenuFlex());

      /* ===== CREDIT ===== */
      if (text === "เครดิต")
        return await safeReply(
          event,
          flexText("💰 เครดิตคงเหลือ", `${p.credit}`)
        );

      /* ===== MANUAL ADD CREDIT ===== */
      if (p.role !== "player" && text.startsWith("เติมเอง ")) {
        const targetUid = text.replace("เติมเอง ", "").trim();
        if (!game.players[targetUid])
          return await safeReply(event, flexText("❌ ไม่พบ UID", ""));
        return await safeReply(event, addCreditManualFlex(targetUid));
      }

      if (p.role !== "player" && /^\+\d+\sU/.test(text)) {
        const [amtTxt, targetUid] = text.split(" ");
        const amount = parseInt(amtTxt.replace("+", ""));
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
          flexText("🎁 เติมเครดิต", `+${amount}\nเครดิต ${game.players[targetUid].credit}`)
        );
        return await safeReply(event, flexText("✅ เติมสำเร็จ", ""));
      }

      /* ===== WITHDRAW ===== */
      if (text.startsWith("ถอน ")) {
        const amt = parseFloat(text.replace("ถอน ", ""));
        if (!amt || amt <= 0 || p.credit < amt)
          return await safeReply(event, flexText("❌ ยอดไม่ถูกต้อง", ""));
        p.withdrawReq = amt;
        savePlayers(game.players);

        for (const o of ADMIN_OWNER) {
          await client.pushMessage(o, approveWithdrawFlex(uid, amt));
        }
        return await safeReply(event, flexText("⏳ รออนุมัติ", ""));
      }

      if (p.role !== "player" && text.startsWith("/approve ")) {
        const tuid = text.replace("/approve ", "");
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

      /* ===== GAME CONTROL ===== */
      if (text === "เปิดรอบ" && p.role !== "player") {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return await safeReply(event, flexText("🟢 เปิดรอบ", `รอบ ${game.round}`));
      }

      if (text === "ปิดรอบ" && p.role !== "player") {
        game.status = "close";
        return await safeReply(event, flexText("🔴 ปิดรอบ", ""));
      }

      /* ===== BET ===== */
      const m = text.match(/^([\d,]+)\/(\d+)$/);
      if (m && game.status === "open") {
        const legs = m[1].split(",").map(Number);
        const amt = parseInt(m[2]);
        const cost = legs.length * amt;
        if (p.credit < cost)
          return await safeReply(event, flexText("❌ เครดิตไม่พอ", ""));
        p.credit -= cost;
        legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);
        savePlayers(game.players);
        return await safeReply(event, flexText("✅ รับโพย", `เครดิต ${p.credit}`));
      }

      /* ===== RESULT PREVIEW ===== */
      if (/^S/i.test(text) && p.role !== "player") {
        const cards = parseResult(text);
        const banker = cards[6];
        const bankerPoint = calcPoint(banker);

        const legs = cards.slice(0, 6).map((c, i) => ({
          leg: i + 1,
          point: calcPoint(c),
          result: compare(c, banker)
        }));

        game.tempResult = { cards, legs, bankerPoint };

        return await safeReply(
          event,
          resultPreviewFlex(game.round, bankerPoint, legs)
        );
      }

      /* ===== CONFIRM RESULT ===== */
      if ((text === "Y" || text === "y") && p.role !== "player" && game.tempResult) {
        const summary = [];

        for (const id in game.players) {
          const pl = game.players[id];
          let net = 0;
          for (const leg in pl.bets) {
            const r = compare(
              game.tempResult.cards[leg - 1],
              game.tempResult.cards[6]
            );
            const bet = pl.bets[leg];
            if (r === 2) net += bet * 2;
            if (r === 1) net += bet;
            if (r === -1) net -= bet;
            if (r === -2) net -= bet * 2;
          }
          pl.credit += net;
          summary.push({ uid: id, net, credit: pl.credit });
          pl.bets = {};
        }

        savePlayers(game.players);
        game.tempResult = null;

        return await safeReply(
          event,
          resultSummaryFlex(game.round, summary)
        );
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
