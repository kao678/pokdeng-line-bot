/* ================== STORAGE (BULLETPROOF) ================== */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const PLAYER_FILE = path.join(DATA_DIR, "players.json");

/* ensure folders/files */
function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(PLAYER_FILE)) fs.writeFileSync(PLAYER_FILE, "{}");
}
ensure();

/* safe read */
function readPlayers() {
  try {
    ensure();
    const raw = fs.readFileSync(PLAYER_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("readPlayers error → reset file", e.message);
    fs.writeFileSync(PLAYER_FILE, "{}");
    return {};
  }
}

/* safe write (atomic) */
function writePlayers(data) {
  try {
    const tmp = PLAYER_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, PLAYER_FILE);
  } catch (e) {
    console.error("writePlayers error", e.message);
  }
}

/* APIs */
function loadPlayers() {
  return readPlayers();
}

function savePlayers(players) {
  writePlayers(players);
}

function initPlayer(players, uid, role = "player") {
  if (!players[uid]) {
    players[uid] = {
      credit: 0,
      bets: {},
      role,
      pendingDeposit: false,
      usedSlip: [],
      withdrawReq: null,
      createdAt: Date.now()
    };
    writePlayers(players);
  }
  return players[uid];
}

module.exports = {
  loadPlayers,
  savePlayers,
  initPlayer
};
