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

/* ================== MENUS ================== */
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
        { type: "button", style: "primary",
          action: { type: "message", label: "💰 เครดิต", text: "เครดิต" }},
        { type: "button", style: "secondary",
          action: { type: "message", label: "📤 ถอน", text: "ถอน 100" }}
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
        { type: "button", action: { type: "message", label: "🟢 เปิดรอบ", text: "เปิดรอบ" }},
        { type: "button", action: { type: "message", label: "🔴 ปิดรอบ", text: "ปิดรอบ" }}
      ]
    }
  }
});

/* ================== RESULT PREVIEW ================== */
const resultPreviewFlex = (round, bankerPoint, legs) => ({
  type: "flex",
  altText: "ผลรอบ",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `เปิดที่ ${round}`, weight: "bold" },
        { type: "text", text: `ขาเจ้า ${bankerPoint} แต้ม`, margin: "md" },
        ...legs.map(l => ({
          type: "text",
          text: `ขา ${l.leg} : ${l.point} แต้ม`
        })),
        { type: "text", text: "พิมพ์ Y เพื่อยืนยัน", margin: "md" }
      ]
    }
  }
});

/* ================== RESULT SUMMARY ================== */
const resultSummaryFlex = (round, summary) => ({
  type: "flex",
  altText: "สรุปรอบ",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `🏆 สรุปรอบ ${round}`, weight: "bold" },
        ...summary.map(s => ({
          type: "text",
          text: `${s.uid.slice(0,6)} : ${s.net >= 0 ? "+" : ""}${s.net} → ${s.credit}`
        }))
      ]
    }
  }
});

/* ================== RESULT SUMMARY PRO (สวยขายจริง) ================== */
const resultSummaryProFlex = (round, summary) => ({
  type: "flex",
  altText: "สรุปยอดรอบ",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `🏆 สรุปรอบที่ ${round}`,
          weight: "bold",
          size: "lg",
          align: "center"
        },
        { type: "separator" },
        ...summary.map(s => ({
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: s.name || s.uid.slice(0,6),
              flex: 3,
              wrap: true
            },
            {
              type: "text",
              text: `${s.net >= 0 ? "+" : ""}${s.net}`,
              flex: 2,
              align: "end",
              color: s.net >= 0 ? "#06C755" : "#FF334B",
              weight: "bold"
            }
          ]
        }))
      ]
    }
  }
});

/* ================== FINANCE FLEX ================== */
const addCreditManualFlex = uid => ({
  type: "flex",
  altText: "เติมเครดิต",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "➕ เติมเครดิต", weight: "bold" },
        { type: "button", action: { type: "message", label: "+500", text: `+500 ${uid}` }},
        { type: "button", action: { type: "message", label: "+1000", text: `+1000 ${uid}` }}
      ]
    }
  }
});

const approveWithdrawFlex = (uid, amt) => ({
  type: "flex",
  altText: "อนุมัติถอน",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `ขอถอน ${amt}`, weight: "bold" },
        { type: "button", style: "primary",
          action: { type: "message", label: "อนุมัติ", text: `/approve ${uid}` }}
      ]
    }
  }
});

/* ================== FLEX CHECK ID ================== */
const checkIdFlex = (uid, role, credit) => ({
  type: "flex",
  altText: "เช็คไอดี",
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: "🆔 USER INFO", weight: "bold", size: "lg" },
        {
          type: "text",
          text: `USER ID:\n${uid}`,
          wrap: true,
          size: "sm"
        },
        {
          type: "text",
          text: `ROLE: ${role.toUpperCase()}`,
          weight: "bold"
        },
        {
          type: "text",
          text: `💰 CREDIT: ${credit}`,
          weight: "bold"
        }
      ]
    }
  }
});

module.exports = {
  flexText,
  playerMenuFlex,
  adminMenuFlex,
  resultPreviewFlex,
  resultSummaryFlex,
  resultSummaryProFlex,
  addCreditManualFlex,
  approveWithdrawFlex,
  checkIdFlex
};
