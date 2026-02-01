const express = require("express");
const line = require("@line/bot-sdk");
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const ADMIN = ["UID_ADMIN"];

const app = express();
const client = new line.Client(config);

let game = {
  round: 156,
  status: "close",
  players: {},
  tempResult: null
};

const reply = (e, msg) =>
  client.replyMessage(e.replyToken, msg);

app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    const uid = event.source.userId;
    const text = event.message.text?.trim();

    if (!game.players[uid]) game.players[uid] = { credit: 2000, bets: {} };
    const p = game.players[uid];

    /* เปิดรอบ */
    if (text === "เปิดรอบ" && ADMIN.includes(uid)) {
      game.round++;
      game.status = "open";
      Object.values(game.players).forEach(p => p.bets = {});
      reply(event, { type: "text", text: `🟢 เปิดรอบ #${game.round}` });
    }

    /* ปิดรอบ */
    if (text === "ปิดรอบ" && ADMIN.includes(uid)) {
      game.status = "close";
      reply(event, { type: "text", text: `🔴 ปิดรอบ #${game.round}` });
    }

    /* แทง */
    const m = text.match(/^([\d,]+)\/(\d+)$/);
    if (m && game.status === "open") {
      const legs = m[1].split(",").map(Number);
      const amt = +m[2];
      const cost = legs.length * amt;

      if (p.credit < cost)
        return reply(event, { type: "text", text: "❌ เครดิตไม่พอ" });

      p.credit -= cost;
      legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);

      reply(event, {
        type: "text",
        text: `✅ รับโพย\nขา ${legs.join(",")} = ${amt}\nคงเหลือ ${p.credit}`
      });
    }

    /* ใส่ผล */
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
      reply(event, resultFlex(game.round, bankerPoint, legs));
    }

    /* ยืนยัน */
    if ((text === "y" || text === "Y") && ADMIN.includes(uid)) {
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

        client.pushMessage(id, {
          type: "text",
          text: `🎯 สรุปรอบ #${game.round}\nกำไร/ขาดทุน ${net}\nคงเหลือ ${pl.credit}`
        });
      }

      reply(event, { type: "text", text: "✅ ยืนยันผลเรียบร้อย" });
    }
  }
  res.sendStatus(200);
});

app.listen(3000, () => console.log("BOT RUNNING"));
