// finance.js
const axios = require("axios");
const vision = require("@google-cloud/vision");

const ocrClient = new vision.ImageAnnotatorClient();

let FINANCE = {
  RECEIVER_NAMES: ["นาง ชนากา กองสูง", "ชนากา กองสูง"]
};

async function downloadSlip(messageId, token) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

async function readSlipText(buffer) {
  const [result] = await ocrClient.textDetection({ image: { content: buffer } });
  return result.fullTextAnnotation?.text || "";
}

const extractAmount = text =>
  (text.replace(/,/g, "").match(/(\d+(\.\d{2})?)\s*บาท/) || [])[1];

const extractTX = text =>
  (text.match(/(TX|Ref|Transaction).*?([A-Z0-9]+)/i) || [])[2];

module.exports.handle = async (
  event, game, client, reply, flexText, token
) => {
  const uid = event.source.userId;
  const p = game.players[uid];

  // ฝาก (รูป)
  if (event.message.type === "image") {
    if (!p.pendingDeposit)
      return reply(event, flexText("❌ ไม่มีรายการฝาก", "พิมพ์ เมนูฝาก"));

    const buffer = await downloadSlip(event.message.id, token);
    const text = await readSlipText(buffer);

    if (!FINANCE.RECEIVER_NAMES.some(n => text.includes(n)))
      return reply(event, flexText("❌ บัญชีไม่ตรง", ""));

    const tx = extractTX(text);
    if (tx && p.usedSlips.has(tx))
      return reply(event, flexText("❌ สลิปซ้ำ", ""));

    const amount = parseFloat(extractAmount(text));
    if (!amount)
      return reply(event, flexText("❌ อ่านยอดไม่ได้", ""));

    p.credit += amount;
    p.pendingDeposit = false;
    if (tx) p.usedSlips.add(tx);
    p.historyDeposit.push({ amount, time: new Date() });

    return reply(event, flexText(
      "✅ ฝากสำเร็จ",
      `💵 ${amount}\n💰 เครดิต ${p.credit}`
    ));
  }

  const text = event.message.text.trim();

  if (text === "เมนูฝาก") {
    p.pendingDeposit = true;
    return reply(event, flexText("📸 ฝากเครดิต", "แนบสลิปได้เลย"));
  }

  if (text.startsWith("ถอน ")) {
    const amt = parseFloat(text.replace("ถอน ", ""));
    if (p.credit < amt)
      return reply(event, flexText("❌ เครดิตไม่พอ", ""));

    p.withdraw = amt;
    return reply(event, flexText("⏳ รอแอดมิน", ""));
  }

  return false;
};
