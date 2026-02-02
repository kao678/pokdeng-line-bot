// game.pokdeng.js
const { compare, calcPoint, parseResult } = require("./pokdeng");
const { resultFlex } = require("./flex");

module.exports.handle = async (event, game, client, reply, flexText) => {
  const uid = event.source.userId;
  const text = event.message.text.trim();
  const p = game.players[uid];

  if (text === "เปิดรอบ" && (p.role === "owner" || p.role === "admin")) {
    game.round++;
    game.status = "open";
    Object.values(game.players).forEach(pl => pl.bets = {});
    return reply(event, flexText("🟢 เปิดรอบ", `รอบที่ ${game.round}`));
  }

  if (text === "ปิดรอบ" && (p.role === "owner" || p.role === "admin")) {
    game.status = "close";
    return reply(event, flexText("🔴 ปิดรอบ", `รอบที่ ${game.round}`));
  }

  const m = text.match(/^([\d,]+)\/(\d+)$/);
  if (m && game.status === "open") {
    const legs = m[1].split(",").map(Number);
    const amt = parseInt(m[2], 10);
    const cost = legs.length * amt;

    if (p.credit < cost)
      return reply(event, flexText("❌ เครดิตไม่พอ", ""));

    p.credit -= cost;
    legs.forEach(l => p.bets[l] = (p.bets[l] || 0) + amt);

    return reply(event, flexText(
      "✅ รับโพยแล้ว",
      `ขา ${legs.join(",")}\nคงเหลือ ${p.credit}`
    ));
  }

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

  if ((text === "y" || text === "Y") &&
      (p.role === "owner" || p.role === "admin") &&
      game.tempResult) {

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
      summary.push(`${pl.lineName} : ${pl.credit}`);
    }

    game.tempResult = null;
    return reply(event, flexText("🏆 สรุปรอบ", summary.join("\n")));
  }

  return false;
};
