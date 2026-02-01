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

/* 🔴 UID แอดมินหลัก (OWNER) */
const ADMIN_OWNER = [
  "Uxxxxxxxxxxxxxxxxxxxxxxxx" // ← ใส่ UID แอดมินหลัก
];

/* 🟡 UID แอดมินย่อย */
const ADMIN_SUB = [
  // "Uyyyyyyyyyyyyyyyyyyyyyyyy"
];

/* ================== INIT ================== */
const app = express();
const client = new line.Client(config);

/* ================== GAME STATE ================== */
let game = {
  round: 156,
  status: "close", // open | close
  players: {},
  tempResult: null,
  summaryMode: "off" // off | text | flex
};

/* ================== UTILS ================== */
const reply = (event, msg) =>
  client.replyMessage(event.replyToken, msg);

/* ===== ดึงชื่อจริงจาก LINE ===== */
async function getPlayerName(event, uid) {
  try {
    if (event.source.type === "group") {
      const profile = await client.getGroupMemberProfile(
        event.source.groupId,
        uid
      );
      return profile.displayName;
    } else {
      const profile = await client.getProfile(uid);
      return profile.displayName;
    }
  } catch {
    return "ไม่ทราบชื่อ";
  }
}

/* ===== ชื่อที่ใช้แสดงผล ===== */
function displayName(p) {
  return p.nickName || p.lineName;
}

/* ===== FLEX SUMMARY TOP 3 ===== */
function summaryFlex(round, players) {
  const sorted = [...players].sort((a, b) => b.credit - a.credit);

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
        { type: "text", text: displayName(p), flex: 4, color: "#FFFFFF" },
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

      /* ===== init player ===== */
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

      /* ================== CHECK USER ID ================== */
      if (text === "เชคไอดี" || text.toLowerCase() === "checkid") {
        return reply(event, {
          type: "text",
          text:
`🆔 USER ID
${uid}
👑 สถานะ: ${
  p.role === "owner"
    ? "แอดมินหลัก"
    : p.role === "admin"
    ? "แอดมินย่อย"
    : "ผู้เล่น"
}`
        });
      }

      /* ================== TEST ================== */
      if (text === "ทดสอบ") {
        return reply(event, {
          type: "text",
          text: "บอทตอบในกลุ่มได้แล้ว ✅"
        });
      }

      /* ================== CHECK BALANCE ================== */
      if (text === "ยอด" || text === "เครดิต") {
        return reply(event, {
          type: "text",
          text:
`💰 เครดิตคงเหลือ
👤 ${displayName(p)}
💵 ${p.credit}`
        });
      }

      /* ================== SET NICKNAME ================== */
      if (text.startsWith("nick ")) {
        const nick = text.replace("nick ", "").trim();
        if (nick.length < 2)
          return reply(event, { type: "text", text: "❌ ชื่อเล่นสั้นเกินไป" });

        p.nickName = nick;
        return reply(event, {
          type: "text",
          text: `✅ ตั้งชื่อเล่นเป็น ${p.nickName} เรียบร้อย`
        });
      }

      /* ================== MY NAME ================== */
      if (text === "myname") {
        return reply(event, {
          type: "text",
          text:
`👤 LINE: ${p.lineName}
🎮 ระบบ: ${displayName(p)}
👑 สถานะ: ${
  p.role === "owner"
    ? "แอดมินหลัก"
    : p.role === "admin"
    ? "แอดมินย่อย"
    : "ผู้เล่น"
}`
        });
      }

      /* ================== SECRET SUMMARY (OWNER ONLY) ================== */
      if (text.startsWith("/summary") && p.role === "owner") {
        if (text === "/summary off") {
          game.summaryMode = "off";
          return reply(event, { type: "text", text: "🔕 ปิดการสรุปยอดแล้ว" });
        }
        if (text === "/summary text") {
          game.summaryMode = "text";
          return reply(event, { type: "text", text: "📄 เปิดสรุปแบบข้อความ" });
        }
        if (text === "/summary flex") {
          game.summaryMode = "flex";
          return reply(event, { type: "text", text: "🎨 เปิดสรุปแบบ Flex" });
        }
      }

      /* ================== OPEN / CLOSE ROUND (OWNER + SUB) ================== */
      if (text === "เปิดรอบ" && (p.role === "owner" || p.role === "admin")) {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => (pl.bets = {}));
        return reply(event, {
          type: "text",
          text: `🟢 เปิดรอบ #${game.round}`
        });
      }

      if (text === "ปิดรอบ" && (p.role === "owner" || p.role === "admin")) {
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

        if (p.credit < cost)
          return reply(event, { type: "text", text: "❌ เครดิตไม่พอแทง" });

        p.credit -= cost;
        legs.forEach(l => (p.bets[l] = (p.bets[l] || 0) + amt));

        return reply(event, {
          type: "text",
          text:
`✅ รับโพย
👤 ${displayName(p)}
ขา ${legs.join(",")} = ${amt}
💰 คงเหลือ ${p.credit}`
        });
      }

      /* ================== RESULT INPUT (OWNER + SUB) ================== */
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

      /* ================== CONFIRM (OWNER + SUB) ================== */
      if ((text === "y" || text === "Y") &&
          (p.role === "owner" || p.role === "admin") &&
          game.tempResult) {

        const banker = game.tempResult.cards[6];

        for (const id in game.players) {
          let net = 0;
          const pl = game.players[id];

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

          await client.pushMessage(id, {
            type: "text",
            text:
`🎯 รอบ #${game.round}
👤 ${displayName(pl)}
ได้/เสีย ${net}
💰 คงเหลือ ${pl.credit}`
          });
        }

        /* ===== SUMMARY (OWNER ONLY) ===== */
        if (game.summaryMode !== "off" && p.role === "owner") {
          const list = Object.values(game.players).filter(p => p.credit > 0);

          if (game.summaryMode === "text") {
            let msg = `📋 สรุปยอดคงเหลือ รอบ #${game.round}\n\n`;
            list
              .sort((a, b) => b.credit - a.credit)
              .forEach((p, i) => {
                msg += `${i + 1}) ${displayName(p)} 💰 ${p.credit}\n`;
              });
            msg += `\n📌 รวมผู้เล่น ${list.length} คน`;

            await client.pushMessage(event.source.groupId, {
              type: "text",
              text: msg
            });
          }

          if (game.summaryMode === "flex") {
            await client.pushMessage(
              event.source.groupId,
              summaryFlex(game.round, list)
            );
          }
        }

        game.tempResult = null;
        return reply(event, {
          type: "text",
          text: "✅ คิดผลเรียบร้อย"
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
