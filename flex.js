/* =====================================================
   FLEX – RESULT DISPLAY (POKDENG)
   ใช้แสดงผลไพ่ / เด้ง / ชนะ / แพ้
   ===================================================== */

function resultFlex(round, bankerPoint, legs) {
  return {
    type: "flex",
    altText: `ผลรอบ ${round}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🃏 ผลป๊อกเด้ง",
            weight: "bold",
            size: "xl",
            align: "center"
          },
          {
            type: "text",
            text: `รอบที่ ${round}`,
            size: "sm",
            align: "center",
            color: "#888888"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "👑 เจ้ามือ",
                weight: "bold",
                size: "md"
              },
              {
                type: "text",
                text: `${bankerPoint} แต้ม`,
                align: "end",
                weight: "bold",
                color: "#ff4757"
              }
            ]
          },
          {
            type: "separator",
            margin: "md"
          },
          ...legs.map(l => ({
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: `ขา ${l.no}`,
                size: "md",
                flex: 1
              },
              {
                type: "text",
                text: l.text,
                size: "sm",
                color: "#555555",
                flex: 2
              },
              {
                type: "text",
                text: l.win ? "✅ ชนะ" : "❌ แพ้",
                size: "sm",
                weight: "bold",
                align: "end",
                color: l.win ? "#06c755" : "#ff4757"
              }
            ]
          }))
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#1e90ff",
            action: {
              type: "message",
              label: "✔ ยืนยันผล (Y)",
              text: "Y"
            }
          }
        ]
      }
    }
  };
}
/* ================== FLEX RESULT LIKE IMAGE ================== */
const pokResultFlex = (round, bankerPoint, legs) => ({
  type: "flex",
  altText: `ผลรอบ ${round}`,
  contents: {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#19b5fe",
          paddingAll: "12px",
          contents: [
            {
              type: "text",
              text: "POK อ๊ะจ๋า",
              weight: "bold",
              size: "lg",
              color: "#ffffff",
              align: "center"
            },
            {
              type: "text",
              text: "ตรวจสอบผลที่ออก",
              size: "sm",
              color: "#ffffff",
              align: "center"
            }
          ]
        },

        {
          type: "text",
          text: `เปิดที่ ${round}`,
          weight: "bold",
          size: "lg",
          align: "center"
        },

        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#eeeeee",
          paddingAll: "10px",
          cornerRadius: "md",
          contents: [
            {
              type: "text",
              text: `ขา เจ้า\n${bankerPoint} แต้ม`,
              align: "center",
              weight: "bold"
            }
          ]
        },

        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: legs.slice(0, 3).map(l => ({
            type: "box",
            layout: "vertical",
            backgroundColor: l.win ? "#6fa8dc" : "#e06666",
            cornerRadius: "md",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: `ขา ${l.no}`,
                weight: "bold",
                align: "center",
                color: "#ffffff"
              },
              {
                type: "text",
                text: l.text,
                size: "sm",
                align: "center",
                color: "#ffffff"
              }
            ]
          }))
        },

        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: legs.slice(3, 6).map(l => ({
            type: "box",
            layout: "vertical",
            backgroundColor: l.win ? "#6fa8dc" : "#e06666",
            cornerRadius: "md",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: `ขา ${l.no}`,
                weight: "bold",
                align: "center",
                color: "#ffffff"
              },
              {
                type: "text",
                text: l.text,
                size: "sm",
                align: "center",
                color: "#ffffff"
              }
            ]
          }))
        },

        {
          type: "text",
          text: "ยืนยันผลสรุป y หรือ Y",
          size: "sm",
          align: "center",
          color: "#888888"
        }
      ]
    }
  }
});

module.exports = { resultFlex };
