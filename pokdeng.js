function calcPoint(cards) {
  let sum = cards.reduce((a, c) => a + Math.min(c, 10), 0);
  return sum % 10;
}

function compare(player, banker) {
  const p = calcPoint(player);
  const b = calcPoint(banker);
  if (p === 9 && player.length === 2) return 2;
  if (b === 9 && banker.length === 2) return -2;
  if (p > b) return 1;
  if (p < b) return -1;
  return 0;
}

function parseResult(text) {
  // S 1-2 3-4 ... B
  return text
    .replace(/^S/i, "")
    .trim()
    .split(" ")
    .map(x => x.split("-").map(Number));
}

module.exports = { compare, calcPoint, parseResult };
