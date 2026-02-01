const cardPoint = c => (c >= 10 ? 0 : c);

const calcPoint = cards =>
  cards.reduce((s, c) => s + cardPoint(c), 0) % 10;

const isDeng = cards =>
  cards.length === 2 && calcPoint(cards) >= 8;

function compare(player, banker) {
  const p = calcPoint(player);
  const b = calcPoint(banker);
  const pd = isDeng(player);
  const bd = isDeng(banker);

  if (pd && !bd) return 2;
  if (!pd && bd) return -2;
  if (p > b) return 1;
  if (p < b) return -1;
  return 0;
}

function parseResult(text) {
  return text
    .replace(/^S/i, "")
    .split(",")
    .map(x => x.trim().split("").map(Number));
}

module.exports = {
  calcPoint,
  isDeng,
  compare,
  parseResult
};
