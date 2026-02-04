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
const BANK_ACCOUNT = {
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
const ADMIN_SUB = [];

/* 🔒 กลุ่มที่อนุญาต (เช็คเฉพาะ player) */
const ALLOWED_GROUPS = ["C682703c2206d1abb1adb7f7c2ca8284c"];

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
        {
          type: "button",
          style: "primary",
          color: "#06c755",
          action: { type: "message", label: "📥 ฝากเครดิต", text: "เมนูฝาก" }
        },
        {
          type: "button",
          action: { type: "message", label: "💰 เครดิตคงเหลือ", text: "เครดิต" }
        },
        {
          type: "button",
          style: "secondary",
          action: { type: "message", label: "📤 ถอนเครดิต", text: "ถอน" }
        }
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
        {
          type: "button",
          style: "primary",
          color: "#1e90ff",
          action: { type: "message", label: "🟢 เปิดรอบ", text: "เปิดรอบ" }
        },
        {
          type: "button",
          style: "secondary",
          action: { type: "message", label: "🔴 ปิดรอบ", text: "ปิดรอบ" }
        },
        {
          type: "button",
          style: "primary",
          color: "#ff4757",
          action: { type: "message", label: "🏆 สรุปผล", text: "Y" }
        }
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

const extractAmount = text => {
  const m = text.replace(/,/g, "").match(/(\d+(\.\d{2})?)\s*บาท/);
  return m ? parseFloat(m[1]) : null;
};

const extractTX = text => {
  const m = text.match(/(TX|Ref|Transaction).*?([A-Z0-9]+)/i);
  return m ? m[2] : null;
};

const matchReceiver = text =>
  RECEIVER_NAMES.some(n => text.includes(n));

/* ================== WEBHOOK ================== */
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    for (const event of req.body.events) {
      if (event.type !== "message") continue;

      const uid = event.source.userId;
      const groupId =
        event.source.type === "group" ? event.source.groupId : null;

      /* INIT PLAYER */
      if (!game.players[uid]) {
        const role = ADMIN_OWNER.includes(uid)
          ? "owner"
          : ADMIN_SUB.includes(uid)
          ? "admin"
          : "player";

        game.players[uid] = {
          credit: 0,
          bets: {},
          role,
          pendingDeposit: false,
          usedSlip: [],
          withdrawReq: null
        };
        savePlayers(game.players);
      }

      const p = game.players[uid];

      /* 🚫 BLOCK GROUP (เฉพาะ player) */
      if (
        groupId &&
        p.role === "player" &&
        !ALLOWED_GROUPS.includes(groupId)
      ) {
        await reply(
          event,
          flexText("❌ ไม่ได้รับอนุญาต", "กลุ่มนี้ยังไม่เปิดใช้งาน")
        );
        continue;
      }

      /* ================== IMAGE (ฝากเงิน) ================== */
      if (event.message.type === "image") {
        if (!p.pendingDeposit) {
          await reply(
            event,
            flexText("❌ ยังไม่ได้เลือกฝาก", "พิมพ์ เมนูฝาก ก่อน")
          );
          continue;
        }

        try {
          const buf = await downloadSlip(event.message.id);
          const text = await readSlip(buf);

          if (!matchReceiver(text))
            return await reply(event, flexText("❌ บัญชีไม่ตรง", ""));

          const tx = extractTX(text);
          if (tx && p.usedSlip.includes(tx))
            return await reply(event, flexText("❌ สลิปซ้ำ", ""));

          const amount = extractAmount(text);
          if (!amount)
            return await reply(event, flexText("❌ อ่านยอดไม่ได้", ""));

          p.credit += amount;
          p.pendingDeposit = false;
          if (tx) p.usedSlip.push(tx);
          savePlayers(game.players);

          return await reply(
            event,
            flexText("✅ ฝากสำเร็จ", `💵 ${amount}\n💰 เครดิต ${p.credit}`)
          );
        } catch (err) {
          console.error("OCR ERROR:", err);
          return await reply(
            event,
            flexText("❌ ระบบอ่านสลิปล้มเหลว", "กรุณาลองใหม่")
          );
        }
      }

      if (event.message.type !== "text") continue;
      const text = event.message.text.trim();

      /* ================== MENUS ================== */
      if (text === "เมนู") {
        if (p.role === "owner" || p.role === "admin")
          return await reply(event, adminMenuFlex());
        return await reply(event, playerMenuFlex());
      }

      if (text === "เมนูฝาก") {
        p.pendingDeposit = true;
        savePlayers(game.players);
        return await reply(
          event,
          flexText(
            "📸 ฝากเครดิต",
            `${BANK_ACCOUNT.bank}\n${BANK_ACCOUNT.name}\n${BANK_ACCOUNT.number}\n\nแนบสลิปได้เลย`
          )
        );
      }

      if (text === "เครดิต")
        return await reply(
          event,
          flexText("💰 เครดิตคงเหลือ", `${p.credit}`)
        );

      /* ================== WITHDRAW ================== */
      if (text.startsWith("ถอน ")) {
        const amt = parseFloat(text.replace("ถอน ", ""));
        if (!amt || amt <= 0)
          return await reply(event, flexText("❌ จำนวนไม่ถูกต้อง", ""));
        if (p.credit < amt)
          return await reply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.withdrawReq = amt;
        savePlayers(game.players);

        for (const o of ADMIN_OWNER) {
          await client.pushMessage(
            o,
            flexText("📤 แจ้งถอน", `UID: ${uid}\nยอด ${amt}`)
          );
        }
        return await reply(event, flexText("⏳ รออนุมัติ", `${amt} บาท`));
      }

      /* ================== ADMIN APPROVE ================== */
      if (p.role !== "player" && text.startsWith("/approve ")) {
        const tuid = text.replace("/approve ", "").trim();
        const tp = game.players[tuid];
        if (!tp || !tp.withdrawReq)
          return await reply(event, flexText("❌ ไม่พบรายการ", ""));

        tp.credit -= tp.withdrawReq;
        tp.withdrawReq = null;
        savePlayers(game.players);

        await client.pushMessage(
          tuid,
          flexText("✅ ถอนสำเร็จ", `เครดิตคงเหลือ ${tp.credit}`)
        );

        return await reply(event, flexText("✅ อนุมัติแล้ว", tuid));
      }

      /* ================== GAME ================== */
      if (text === "เปิดรอบ" && p.role !== "player") {
        game.round++;
        game.status = "open";
        Object.values(game.players).forEach(pl => (pl.bets = {}));
        return await reply(event, flexText("🟢 เปิดรอบ", `รอบ ${game.round}`));
      }

      if (text === "ปิดรอบ" && p.role !== "player") {
        game.status = "close";
        return await reply(event, flexText("🔴 ปิดรอบ", `รอบ ${game.round}`));
      }

      const betMatch = text.match(/^([\d,]+)\/(\d+)$/);
      if (betMatch && game.status === "open") {
        const legs = betMatch[1].split(",").map(Number);
        const amt = parseInt(betMatch[2], 10);
        const cost = legs.length * amt;

        if (p.credit < cost)
          return await reply(event, flexText("❌ เครดิตไม่พอ", ""));

        p.credit -= cost;
        legs.forEach(l => (p.bets[l] = (p.bets[l] || 0) + amt));
        savePlayers(game.players);

        return await reply(
          event,
          flexText("✅ รับโพย", `ขา ${legs.join(",")}\nเครดิต ${p.credit}`)
        );
      }

      if (/^S/i.test(text) && p.role !== "player") {
        const cards = parseResult(text);
        const banker = cards[cards.length - 1];
        const bankerPoint = calcPoint(banker);

        const legs = cards.slice(0, 6).map((c, i) => ({
          no: i + 1,
          win: compare(c, banker) > 0,
          text: `${calcPoint(c)} แต้ม`
        }));

        game.tempResult = { cards };
        return await reply(event, resultFlex(game.round, bankerPoint, legs));
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
            if (r === 2) net += bet * 2;
            if (r === 1) net += bet;
            if (r === -1) net -= bet;
            if (r === -2) net -= bet * 2;
          }
          pl.credit += net;
          pl.bets = {};
          summary.push(`${id} : ${pl.credit}`);
        }

        savePlayers(game.players);
        game.tempResult = null;

        return await reply(event, flexText("🏆 สรุปรอบ", summary.join("\n")));
      }
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error("WEBHOOK ERROR:", e);
    return res.sendStatus(500);
  }
});

/* ================== SERVER ================== */
app.listen(process.env.PORT || 3000, () =>
  console.log("BOT RUNNING")
);
