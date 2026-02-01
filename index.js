const express = require("express");
const line = require("@line/bot-sdk");
const { compare, calcPoint, parseResult } = require("./pokdeng");

/* ================== CONFIG ================== */
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

/* 🔴 ใส่ Group ID หลังจากเช็ค */
const ALLOWED_GROUP = "C682703c2206d1abb1adb7f7c2ca8284c";

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== GAME STATE ================== */
let game = {
  round: 1,
  status: "close",
  players: {},
  tempResult: null
};

/* ================== UTILS ================== */
const reply = (event, msg) =>
  client.replyMessage(event.replyToken, msg);

const isAllowedGroup = event =>
  event.source.type === "group" &&
  event.source.groupId === ALLOWED_GROUP;

/* ================== FLEX SUMMARY (TOP 3) ================== */
function summaryFlex(round, players) {
  const sorted = players.sort((a, b) => b.credit - a.credit);

  const rows = sorted.map((p, i) => {
    let color = "#FFFFFF";
    if (i === 0) color = "#FFD700";
    if (i === 1) color = "#C0C0C0";
    if (i === 2) color = "#CD7F32";

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${i + 1}`, flex: 1, color },
        { type: "text", text: p.name, flex: 4, color: "#FFFFFF" },
        { type: "text", text: `💰 ${p.credit}`, flex: 3, align: "end", color }
      ],
      margin: "sm"
    };
  });

  return {
    type: "flex",
    altText: "สรุปยอดคงเหลือ",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        contents: [
          {
            type: "text",
            text: "🏆 สรุปยอดคงเหลือ",
            size: "lg",
            weight: "bold",
            color: "#FFD700"
          },
          {
            type: "text",
            text: `รอบ #${round}`,
            size: "sm",
            color: "#AAAAAA",
            margin: "sm"
          },
          { type: "separator", margin: "md" },
          ...rows
        ]
      }
    }
  };
}

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const uid = event.source.userId;
      const text = event.message.text.trim();

      /* ===== CHECK GROUP ID (ใช้ก่อนล็อกกลุ่ม) ===== */
      if (text === "เช็คกลุ่ม" || text.toLowerCase() === "checkgroup") {
        if (event.source.type === "group") {
          return reply(event, {
            type: "text",
            text: `🆔 Group ID\n${event.source.groupId}`
          });
        } else {
          return reply(event, {
            type: "text",
            text: "❌ คำสั่งนี้ใช้ได้เฉพาะในกลุ่ม"
          });
        }
      }

      /* ===== ล็อกกลุ่ม ===== */
      if (!isAllowedGroup(event)) continue;

      /* ===== init player ===== */
      if (!game.players[uid]) {
        game.players[uid] = {
          name: "ไม่ระบุชื่อ",
          credit: 2000,
          bets: {}
        };
      }
      const p = game.players[uid];

      /* ===== ตั้งชื่อ ===== */
      if (text.startsWith("ชื่อ ")) {
        p.name = text.replace("ชื่อ ", "").trim();
        return reply(event, {
          type: "text",
          text: `✅ ตั้งชื่อเป็น ${p.name} เรียบร้อย`
        });
      }

      /* ===== เติมเครดิต ===== */
      const add = text.match(/^เติม\s+(.+)\s+(\d+)$/);
      if (add) {
        const [, name, amt] = add;
        const target = Object.values(game.players)
          .find(pl => pl.name === name);

        if (!target)
          return reply(event, {
            type: "text",
            text: "❌ ไม่พบผู้เล่นชื่อนี้"
          });

        target.credit += Number(amt);
        return reply(event, {
          type: "text",
          text: `💰 เติมเครดิตให้ ${name} +${amt}\nคงเหลือ ${target.credit}`
        });
      }

      /* ===== เปิดรอบ ===== */
      if (text === "เปิดรอบ") {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return reply(event, {
          type: "text",
          text: `🟢 เปิดรอบ #${game.round}`
        });
      }

      /* ===== ปิดรอบ + สรุป + เปิดใหม่ ===== */
      if (text === "ปิดรอบ") {
        game.status = "close";

        const list = Object.values(game.players)
          .filter(p => p.credit > 0);

        await reply(event, {
          type: "text",
          text: `🔴 ปิดรอบ #${game.round}`
        });

        await client.pushMessage(
          event.source.groupId,
          summaryFlex(game.round, list)
        );

        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => pl.bets = {});
        return client.pushMessage(event.source.groupId, {
          type: "text",
          text: `🟢 เปิดรอบใหม่อัตโนมัติ #${game.round}`
        });
      }

      /* ===== รับโพย ===== */
      const m = text.match(/^([\d,]+)\/(\d+)$/);
      if (m && game.status === "open") {
        const legs = m[1].split(",").map(Number);
        const amt = parseInt(m[2], 10);
        const cost = legs.length * amt;

        if (p.credit < cost)
          return reply(event, { type: "text", text: "❌ เครดิตไม่พอ" });

        p.credit -= cost;
        legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);

        return reply(event, {
          type: "text",
          text:
`✅ ${p.name}
ขา ${legs.join(",")} = ${amt}
💰 คงเหลือ ${p.credit}`
        });
      }

      /* ===== ใส่ผล ===== */
      if (/^S/i.test(text)) {
        game.tempResult = parseResult(text);
        return reply(event, {
          type: "text",
          text: "📊 รับผลแล้ว พิมพ์ y เพื่อยืนยัน"
        });
      }

      /* ===== ยืนยันผล ===== */
      if (text.toLowerCase() === "y" && game.tempResult) {
        const banker = game.tempResult[6];

        for (const id in game.players) {
          let net = 0;
          const pl = game.players[id];

          for (const leg in pl.bets) {
            const r = compare(game.tempResult[leg - 1], banker);
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
`🎯 ${pl.name}
ได้/เสีย ${net}
💰 คงเหลือ ${pl.credit}`
          });
        }

        game.tempResult = null;
        return reply(event, {
          type: "text",
          text: "✅ คิดผลเรียบร้อย"
        });
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

/* ================== SERVER ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("BOT RUNNING", PORT)
);
