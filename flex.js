function resultFlex(round, bankerPoint, legs) {
  return {
    type: "flex",
    altText: "ผลป๊อกเด้ง",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "POK อะจ้า", weight: "bold", size: "xl", align: "center" },
          { type: "text", text: "ตรวจสอบผลที่ออก", align: "center", color: "#666" },
          { type: "separator", margin: "md" },
          { type: "text", text: `เปิดที่ ${round}`, align: "center", weight: "bold", margin: "md" },
          { type: "text", text: `ขาเจ้า ${bankerPoint} แต้ม`, align: "center", margin: "md" },

          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "lg",
            contents: legs.map(l => ({
              type: "box",
              layout: "vertical",
              backgroundColor: l.win ? "#4A90E2" : "#E74C3C",
              cornerRadius: "md",
              paddingAll: "sm",
              contents: [{
                type: "text",
                text: `ขา ${l.no}\n${l.text}`,
                align: "center",
                color: "#FFF"
              }]
            }))
          },

          {
            type: "text",
            text: "ยืนยันผลสรุป y หรือ Y",
            align: "center",
            size: "sm",
            color: "#999",
            margin: "lg"
          }
        ]
      }
    }
  };
}

module.exports = { resultFlex };
