const fs = require('fs');
const path = require('path');

const CHUNK_DIR = 'C:\\Users\\kingv\\AppData\\Local\\Temp\\schedule_chunks';
const OUT_PATH = path.join(__dirname, '..', 'extension', 'data', 'schedule.json');

// ESPN's scoreboard abbreviations don't all match the canonical ones Yahoo/name-utils.ts use
// (and a couple of entries are placeholders like "TBD"/"LON" for exhibitions, not real teams).
const ABBR_ALIASES = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
const KNOWN_TEAMS = new Set([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND',
  'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX',
  'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
function canonicalAbbr(raw) {
  const mapped = ABBR_ALIASES[raw] || raw;
  return KNOWN_TEAMS.has(mapped) ? mapped : null;
}

const games = new Map(); // gameId -> game

for (const file of fs.readdirSync(CHUNK_DIR)) {
  const payload = JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, file), 'utf8'));
  const events = payload.events || [];
  for (const event of events) {
    if (!event.id || !event.date) continue;
    if (event.season && event.season.slug && event.season.slug !== 'regular-season') continue; // skip preseason/exhibitions
    const competitors = (event.competitions && event.competitions[0] && event.competitions[0].competitors) || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    if (!home || !away || !home.team || !away.team) continue;
    const homeAbbr = canonicalAbbr(home.team.abbreviation);
    const awayAbbr = canonicalAbbr(away.team.abbreviation);
    if (!homeAbbr || !awayAbbr) continue; // skip exhibitions/placeholders (e.g. "TBD", "LON")
    const type = event.status && event.status.type;
    const status = type && type.completed ? 'final'
      : type && type.state === 'in' ? 'in_progress'
      : type && type.state === 'pre' ? 'scheduled'
      : 'unknown';
    games.set(event.id, {
      id: event.id,
      date: event.date.slice(0, 10),
      datetime: event.date,
      status,
      home: homeAbbr,
      away: awayAbbr,
    });
  }
}

const byTeam = {};
for (const game of games.values()) {
  for (const [abbr, opponent, isHome] of [[game.home, game.away, true], [game.away, game.home, false]]) {
    if (!byTeam[abbr]) byTeam[abbr] = [];
    byTeam[abbr].push({
      gameId: game.id,
      date: game.date,
      datetime: game.datetime,
      status: game.status,
      opponent,
      home: isHome,
    });
  }
}
for (const abbr of Object.keys(byTeam)) {
  byTeam[abbr].sort((a, b) => a.date.localeCompare(b.date));
}

const dates = [...games.values()].map((g) => g.date).sort();
const output = {
  schemaVersion: 1,
  source: 'espn-public-scoreboard-bundled',
  generatedAt: new Date().toISOString(),
  coverage: { start: dates[0], end: dates[dates.length - 1] },
  teams: byTeam,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(output));
console.log('games:', games.size, 'teams:', Object.keys(byTeam).length, 'coverage:', output.coverage);
console.log('wrote', OUT_PATH, fs.statSync(OUT_PATH).size, 'bytes');
