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

/* 🔴 ใส่ UID แอดมินจริง */
const ADMIN = [
  "Uxxxxxxxxxxxxxxxxxxxxxxxx" // ← แก้เป็น UID คุณ
];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== GAME STATE ================== */
let game = {
  round: 156,
  status: "close", // open | close
  players: {},
  tempResult: null
};

/* ================== UTILS ================== */
const reply = (event, msg) =>
  client.replyMessage(event.replyToken, msg);

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {

      /* 🔒 กรอง event ที่ไม่ใช่ข้อความ */
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const uid = event.source.userId;
      const text = event.message.text.trim();

      /* DEBUG เอา UID ไปใส่ ADMIN (ใช้ครั้งเดียว) */
      // console.log("UID:", uid);

      /* init player */
      if (!game.players[uid]) {
        game.players[uid] = {
          credit: 2000,
          bets: {}
        };
      }
      const p = game.players[uid];

      /* ================== TEST ================== */
      if (text === "ทดสอบ") {
        return reply(event, {
          type: "text",
          text: "บอทตอบในกลุ่มได้แล้ว ✅"
        });
      }

      /* ================== ADMIN ================== */
      if (text === "เปิดรอบ" && ADMIN.includes(uid)) {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return reply(event, {
          type: "text",
          text: `🟢 เปิดรอบ #${game.round}`
        });
      }

      if (text === "ปิดรอบ" && ADMIN.includes(uid)) {
        game.status = "close";
        return reply(event, {
          type: "text",
          text: `🔴 ปิดรอบ #${game.round}`
        });
      }

      /* ================== BET ================== */
      const m = text.match(/^([\d,]+)\/(\d+)$/);
      if (m && game.status === "open") {
        const legs = m[1].split(",").map(Number);
        const amt = parseInt(m[2], 10);
        const cost = legs.length * amt;

        if (p.credit < cost) {
          return reply(event, {
            type: "text",
            text: "❌ เครดิตไม่พอแทง"
          });
        }

        p.credit -= cost;
        legs.forEach(l => {
          p.bets[l] = (p.bets[l] || 0) + amt;
        });

        return reply(event, {
          type: "text",
          text: `✅ รับโพย\nขา ${legs.join(",")} = ${amt}\nคงเหลือ ${p.credit}`
        });
      }

      /* ================== RESULT INPUT ================== */
      if (/^S/i.test(text) && ADMIN.includes(uid)) {
        const cards = parseResult(text);
        const banker = cards[cards.length - 1];
        const bankerPoint = calcPoint(banker);

        const legs = cards.slice(0, 6).map((c, i) => {
          const r = compare(c, banker);
          return {
            no: i + 1,
            win: r > 0,
            text: `${calcPoint(c)} แต้ม`
          };
        });

        game.tempResult = { cards };

        return reply(
          event,
          resultFlex(game.round, bankerPoint, legs)
        );
      }

      /* ================== CONFIRM ================== */
      if ((text === "y" || text === "Y") &&
          ADMIN.includes(uid) &&
          game.tempResult) {

        const banker = game.tempResult.cards[6];

        for (const id in game.players) {
          let net = 0;
          const pl = game.players[id];

          for (const leg in pl.bets) {
            const r = compare(
              game.tempResult.cards[leg - 1],
              banker
            );
            const bet = pl.bets[leg];

            if (r === 2) net += bet * 2;
            if (r === 1) net += bet;
            if (r === -1) net -= bet;
            if (r === -2) net -= bet * 2;
          }

          pl.credit += net;
          pl.bets = {};

          await client.pushMessage(id, {
            type: "text",
            text:
`🎯 สรุปรอบ #${game.round}
กำไร/ขาดทุน ${net}
คงเหลือ ${pl.credit}`
          });
        }

        game.tempResult = null;

        return reply(event, {
          type: "text",
          text: "✅ ยืนยันผลเรียบร้อย"
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/* ================== SERVER ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("BOT RUNNING ON PORT", PORT)
);
