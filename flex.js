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

module.exports = {
  flexText,
  playerMenuFlex,
  adminMenuFlex,
  resultPreviewFlex,
  resultSummaryFlex,
  addCreditManualFlex,
  approveWithdrawFlex
};
