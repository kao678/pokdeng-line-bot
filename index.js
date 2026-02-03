/* ================== IMPORT ================== */
const express = require("express");
const line = require("@line/bot-sdk");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

/* 👑 OWNER (ต้องเป็น UID จริง) */
const ADMIN_OWNER = [
  "Uab107367b6017b2b5fede655841f715c"
];

/* 🟡 ADMIN SUB */
let ADMIN_SUB = [];

/* 🔒 กลุ่มที่อนุญาต */
let ALLOWED_GROUPS = [
  "C682703c2206d1abb1adb7f7c2ca8284c"
];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== GAME STATE ================== */
let game = {
  round: 156,
  status: "close",
  players: {},
  tempResult: null,
  summaryMode: "flex"
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

/* ================== HELPERS ================== */
const isAllowedGroup = gid => ALLOWED_GROUPS.includes(gid);

async function getPlayerName(event, uid) {
  try {
    if (event.source.type === "group") {
      const p = await client.getGroupMemberProfile(event.source.groupId, uid);
      return p.displayName;
    } else {
      const p = await client.getProfile(uid);
      return p.displayName;
    }
  } catch {
    return "ไม่ทราบชื่อ";
  }
}

const displayName = p => p.nickName || p.lineName;

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {

      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const uid = event.source.userId;
      const text = event.message.text.trim();
      const groupId = event.source.type === "group"
        ? event.source.groupId
        : null;

      /* LOG สำคัญ */
      console.log("CMD:", text, "FROM:", uid);

      /* 🚫 BLOCK กลุ่มที่ไม่อนุญาต */
      if (groupId && !isAllowedGroup(groupId)) {
        await reply(event, flexText(
          "❌ ไม่ได้รับอนุญาต",
          "กลุ่มนี้ไม่ได้รับสิทธิ์ใช้งานบอท"
        ));
        continue;
      }

      /* ===== INIT PLAYER ===== */
      if (!game.players[uid]) {
        const lineName = await getPlayerName(event, uid);
        let role = "player";
        if (ADMIN_OWNER.includes(uid)) role = "owner";
        else if (ADMIN_SUB.includes(uid)) role = "admin";

        game.players[uid] = {
          credit: 2000,
          bets: {},
          lineName,
          nickName: null,
          role
        };
      }

      const p = game.players[uid];

      console.log("ROLE:", p.role);

      /* ================== BASIC ================== */
      if (/^ทดสอบ$/.test(text)) {
        return reply(event, flexText("✅ ระบบออนไลน์", "บอททำงานปกติ"));
      }

      if (/^(เชคไอดี|checkid)$/i.test(text)) {
        return reply(event, flexText(
          "🆔 USER INFO",
          `USER ID:\n${uid}\nROLE: ${p.role}`
        ));
      }

      if (/^(เครดิต|ยอด)$/.test(text)) {
        return reply(event, flexText(
          "💰 เครดิตคงเหลือ",
          `${displayName(p)}\n💵 ${p.credit}`
        ));
      }

      /* ================== GAME ================== */
      if (/^เปิดรอบ$/i.test(text) && (p.role === "owner" || p.role === "admin")) {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return reply(event, flexText(
          "🟢 เปิดรอบสำเร็จ",
          `รอบที่ ${game.round}`
        ));
      }

      if (/^ปิดรอบ$/i.test(text) && (p.role === "owner" || p.role === "admin")) {
        game.status = "close";
        return reply(event, flexText(
          "🔴 ปิดรอบแล้ว",
          `รอบที่ ${game.round}`
        ));
      }

      /* ===== รับโพย ===== */
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
          "✅ รับโพยแล้ว",
          `${displayName(p)}\nขา ${legs.join(",")}\n💰 คงเหลือ ${p.credit}`
        ));
      }

      /* ===== ใส่ผล ===== */
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

      /* ===== สรุป ===== */
      if (/^y$/i.test(text) &&
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
          summary.push(`${displayName(pl)} : ${pl.credit}`);
        }

        game.tempResult = null;
        return reply(event, flexText(
          "🏆 สรุปรอบ",
          summary.join("\n")
        ));
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("ERROR:", e);
    res.sendStatus(500);
  }
});

/* ================== SERVER ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("BOT RUNNING ON PORT", PORT)
);
