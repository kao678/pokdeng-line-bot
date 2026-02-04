/* ================== STORAGE ================== */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const PLAYER_FILE = path.join(DATA_DIR, "players.json");

/* ensure data folder */
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PLAYER_FILE)) fs.writeFileSync(PLAYER_FILE, "{}");

/* ================== HELPERS ================== */
function readPlayers() {
  return JSON.parse(fs.readFileSync(PLAYER_FILE, "utf8"));
}

function writePlayers(data) {
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));
}

/* ================== API ================== */
function getPlayer(uid) {
  const players = readPlayers();
  return players[uid] || null;
}

function initPlayer(uid, role = "player") {
  const players = readPlayers();
  if (!players[uid]) {
    players[uid] = {
      credit: 0,          // A1: เริ่ม 0
      role,
      bets: {},
      createdAt: Date.now()
    };
    writePlayers(players);
  }
  return players[uid];
}

function updatePlayer(uid, updater) {
  const players = readPlayers();
  if (!players[uid]) return null;
  updater(players[uid]);
  writePlayers(players);
  return players[uid];
}

function addCredit(uid, amount) {
  return updatePlayer(uid, p => {
    p.credit += amount;
  });
}

function deductCredit(uid, amount) {
  return updatePlayer(uid, p => {
    p.credit -= amount;
  });
}

function setBets(uid, bets) {
  return updatePlayer(uid, p => {
    p.bets = bets;
  });
}

function clearBets(uid) {
  return updatePlayer(uid, p => {
    p.bets = {};
  });
}

function allPlayers() {
  return readPlayers();
}

module.exports = {
  getPlayer,
  initPlayer,
  updatePlayer,
  addCredit,
  deductCredit,
  setBets,
  clearBets,
  allPlayers
};
