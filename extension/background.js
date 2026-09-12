const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const WEB_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const TEAMS = [
  ['1', 'ATL'], ['2', 'BOS'], ['17', 'BKN'], ['30', 'CHA'], ['4', 'CHI'], ['5', 'CLE'],
  ['6', 'DAL'], ['7', 'DEN'], ['8', 'DET'], ['9', 'GSW'], ['10', 'HOU'], ['11', 'IND'],
  ['12', 'LAC'], ['13', 'LAL'], ['29', 'MEM'], ['14', 'MIA'], ['15', 'MIL'], ['16', 'MIN'],
  ['3', 'NOP'], ['18', 'NYK'], ['25', 'OKC'], ['19', 'ORL'], ['20', 'PHI'], ['21', 'PHX'],
  ['22', 'POR'], ['23', 'SAC'], ['24', 'SAS'], ['28', 'TOR'], ['26', 'UTA'], ['27', 'WAS'],
];
const TEAM_ALIASES = {
  GS: 'GSW', GSW: 'GSW',
  NO: 'NOP', NOR: 'NOP', NOP: 'NOP',
  NY: 'NYK', NYK: 'NYK',
  PHO: 'PHX', PHX: 'PHX',
  SA: 'SAS', SAS: 'SAS',
  BRK: 'BKN', BKN: 'BKN',
};

const DIRECTORY_CACHE_KEY = 'espnPlayerDirectoryCache';
const DIRECTORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_INPUT_PLAYERS = 60;
const MAX_STRING_LEN = 300;
const SCHEDULE_LOOKBACK_DAYS = 3;
const SCHEDULE_LOOKAHEAD_DAYS = 14;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ companionVersion: '0.2.0', readOnly: true });
});

function normalizePlayerName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeTeamAbbreviation(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return TEAM_ALIASES[normalized] || normalized;
}

function clampString(value, max) {
  return String(value || '').slice(0, max);
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`espn_http_${response.status}`);
  return response.json();
}

async function getPlayerDirectory() {
  const cached = await chrome.storage.local.get(DIRECTORY_CACHE_KEY);
  const entry = cached[DIRECTORY_CACHE_KEY];
  if (entry && entry.expiresAt > Date.now() && Array.isArray(entry.players) && entry.players.length >= 100) {
    return entry.players;
  }

  const settled = await Promise.allSettled(TEAMS.map(async ([teamId, abbreviation]) => {
    const payload = await fetchJson(`${SITE_BASE}/teams/${abbreviation.toLowerCase()}/roster`);
    return (payload.athletes || []).map((athlete) => {
      if (!athlete || !athlete.id || !athlete.fullName) return null;
      return {
        id: String(athlete.id),
        name: athlete.fullName,
        teamId,
        teamAbbreviation: abbreviation,
        positions: athlete.position && athlete.position.abbreviation ? [athlete.position.abbreviation] : [],
      };
    }).filter(Boolean);
  }));

  const players = settled.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value);
  const deduped = [...new Map(players.map((player) => [player.id, player])).values()];

  if (deduped.length >= 100) {
    await chrome.storage.local.set({
      [DIRECTORY_CACHE_KEY]: { players: deduped, expiresAt: Date.now() + DIRECTORY_TTL_MS },
    });
    return deduped;
  }

  // Roster fetch mostly failed (e.g. offline). Fall back to a stale cache rather than nothing.
  if (entry && Array.isArray(entry.players) && entry.players.length > 0) return entry.players;
  return deduped;
}

function sanitizePlayers(rawPlayers) {
  if (!Array.isArray(rawPlayers)) return [];
  return rawPlayers
    .slice(0, MAX_INPUT_PLAYERS)
    .filter((player) => player && typeof player.yahooPlayerId === 'string' && typeof player.name === 'string' && player.name.trim().length >= 2)
    .map((player) => ({
      yahooPlayerId: clampString(player.yahooPlayerId, 100),
      name: clampString(player.name, 100),
      nbaTeam: player.nbaTeam ? clampString(player.nbaTeam, 10) : undefined,
      eligiblePositions: Array.isArray(player.eligiblePositions) ? player.eligiblePositions.slice(0, 10).map((position) => clampString(position, 10)) : [],
      rawStatus: player.rawStatus ? clampString(player.rawStatus, MAX_STRING_LEN) : undefined,
    }));
}

function matchOne(input, directory) {
  const name = normalizePlayerName(input.name);
  const team = normalizeTeamAbbreviation(input.nbaTeam);
  const exact = directory.filter((candidate) => normalizePlayerName(candidate.name) === name);
  const sameTeam = exact.filter((candidate) => normalizeTeamAbbreviation(candidate.teamAbbreviation) === team);
  const selected = sameTeam.length === 1 ? sameTeam[0] : exact.length === 1 ? exact[0] : undefined;

  if (selected) {
    const teamConfirmed = Boolean(team && normalizeTeamAbbreviation(selected.teamAbbreviation) === team);
    return {
      yahooPlayerId: input.yahooPlayerId,
      yahooName: input.name,
      status: 'matched',
      confidence: teamConfirmed ? 1 : 0.96,
      reason: teamConfirmed ? '정규화된 이름과 NBA 팀이 모두 일치합니다.' : '정규화된 전체 이름이 정확히 일치합니다.',
      nbaPlayer: {
        ...selected,
        positions: input.eligiblePositions && input.eligiblePositions.length ? input.eligiblePositions : selected.positions,
      },
    };
  }
  return {
    yahooPlayerId: input.yahooPlayerId,
    yahooName: input.name,
    status: exact.length > 1 ? 'ambiguous' : 'unmatched',
    confidence: 0,
    reason: exact.length > 1 ? '같은 이름의 NBA 선수가 여러 명이라 팀 확인이 필요합니다.' : 'NBA 공식 선수 명단에서 정확한 이름을 찾지 못했습니다.',
  };
}

async function matchYahooPlayers(players) {
  const directory = await getPlayerDirectory();
  return players.map((input) => matchOne(input, directory));
}

function normalizeStatName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rawValue(stats, indexes, keys) {
  for (const key of keys) {
    const index = indexes.get(normalizeStatName(key));
    if (index !== undefined) return String(stats[index] || '');
  }
  return '';
}

function valueFor(stats, indexes, keys) {
  return finite(rawValue(stats, indexes, keys));
}

function madeAttempted(stats, indexes, keys) {
  const raw = rawValue(stats, indexes, keys);
  const match = raw.match(/([\d.]+)\s*[-/]\s*([\d.]+)/);
  return match ? [finite(match[1]), finite(match[2])] : [0, 0];
}

function seasonEndYear(date) {
  const month = date.getUTCMonth() + 1;
  return month >= 10 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
}

async function getPlayerGamelog(espnPlayerId) {
  const season = seasonEndYear(new Date());
  const payload = await fetchJson(`${WEB_BASE}/athletes/${espnPlayerId}/gamelog?season=${season}`);
  const names = payload.names || payload.labels || [];
  const indexes = new Map(names.map((name, index) => [normalizeStatName(name), index]));
  const categories = (payload.seasonTypes || []).flatMap((seasonType) => seasonType.categories || []);
  const events = categories
    .filter((category) => category.type === 'total' || /regular/i.test(category.displayName || ''))
    .flatMap((category) => category.events || []);
  const uniqueEvents = events.length ? events : categories.flatMap((category) => category.events || []);

  return uniqueEvents.map((event) => {
    if (!event.eventId || !event.gameDate || !event.stats) return null;
    const stat = (keys) => valueFor(event.stats, indexes, keys);
    const pts = stat(['points', 'pts']);
    const reb = stat(['rebounds', 'reb']);
    const ast = stat(['assists', 'ast']);
    const st = stat(['steals', 'stl']);
    const blk = stat(['blocks', 'blk']);
    const doubles = [pts, reb, ast, st, blk].filter((value) => value >= 10).length;
    const [fgm, fga] = madeAttempted(event.stats, indexes, ['fieldgoalsmade-fieldgoalsattempted', 'fg']);
    const [threePM, threePA] = madeAttempted(event.stats, indexes, ['threepointfieldgoalsmade-threepointfieldgoalsattempted', '3pt']);
    const [ftm, fta] = madeAttempted(event.stats, indexes, ['freethrowsmade-freethrowsattempted', 'ft']);
    return {
      playerId: String(espnPlayerId),
      teamId: (event.team && event.team.id) || '',
      teamAbbreviation: (event.team && event.team.abbreviation) || '',
      gameId: String(event.eventId),
      date: String(event.gameDate).slice(0, 10),
      minutes: stat(['minutes', 'min']),
      stats: {
        FGA: fga, FGM: fgm, FTA: fta, FTM: ftm, threePA, threePM,
        PTS: pts, REB: reb, AST: ast, ST: st, BLK: blk, TO: stat(['turnovers', 'to']),
        DD: doubles >= 2 ? 1 : 0, TD: doubles >= 3 ? 1 : 0,
      },
    };
  }).filter(Boolean).slice(-30);
}

function normalizeGameStatus(type) {
  if (type && type.completed) return 'final';
  if (type && type.state === 'pre') return 'scheduled';
  if (type && type.state === 'in') return 'in_progress';
  const name = ((type && type.name) || '').toLowerCase();
  if (name.includes('postpon')) return 'postponed';
  if (name.includes('cancel')) return 'canceled';
  return 'unknown';
}

function normalizeGame(event) {
  if (!event.id || !event.date) return null;
  const competitors = (event.competitions && event.competitions[0] && event.competitions[0].competitors) || [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home');
  const away = competitors.find((competitor) => competitor.homeAway === 'away');
  return {
    id: String(event.id),
    date: String(event.date).slice(0, 10),
    datetime: event.date,
    status: normalizeGameStatus(event.status && event.status.type),
    homeTeamId: (home && home.team && home.team.id) || '',
    visitorTeamId: (away && away.team && away.team.id) || '',
    homeTeamScore: finite(home && home.score),
    visitorTeamScore: finite(away && away.score),
  };
}

async function getSchedule() {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - SCHEDULE_LOOKBACK_DAYS);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + SCHEDULE_LOOKAHEAD_DAYS);
  const dates = `${isoDate(start).replaceAll('-', '')}-${isoDate(end).replaceAll('-', '')}`;
  const payload = await fetchJson(`${SITE_BASE}/scoreboard?dates=${dates}&limit=1000`);
  return (payload.events || []).map(normalizeGame).filter(Boolean);
}

async function handleMatchRequest(rawPayload) {
  const players = sanitizePlayers(rawPayload && rawPayload.players);
  const errors = [];

  if (players.length === 0) {
    return { collectedAt: new Date().toISOString(), matches: [], games: [], gameStats: [], errors: ['no_players'] };
  }

  let matches = [];
  try {
    matches = await matchYahooPlayers(players);
  } catch {
    errors.push('player_directory_unavailable');
    matches = players.map((player) => ({
      yahooPlayerId: player.yahooPlayerId,
      yahooName: player.name,
      status: 'unmatched',
      confidence: 0,
      reason: 'NBA 선수 명단을 불러오지 못했습니다.',
    }));
  }

  const matchedIds = [...new Set(
    matches
      .filter((match) => match.status === 'matched' && match.nbaPlayer)
      .map((match) => match.nbaPlayer.id),
  )].slice(0, MAX_INPUT_PLAYERS);

  let games = [];
  try {
    games = await getSchedule();
  } catch {
    errors.push('schedule_unavailable');
  }

  const gamelogResults = await Promise.allSettled(matchedIds.map((id) => getPlayerGamelog(id)));
  const gameStats = gamelogResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);
  if (gamelogResults.some((result) => result.status === 'rejected')) errors.push('gamelog_partial');

  return {
    collectedAt: new Date().toISOString(),
    matches,
    games,
    gameStats,
    errors,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'NBA_ASSISTANT_MATCH_PLAYERS') return false;
  handleMatchRequest(message.payload)
    .then((result) => sendResponse({ type: 'NBA_ASSISTANT_MATCH_RESPONSE', payload: result }))
    .catch((error) => sendResponse({
      type: 'NBA_ASSISTANT_MATCH_RESPONSE',
      payload: { collectedAt: new Date().toISOString(), matches: [], games: [], gameStats: [], errors: [error instanceof Error ? error.message : 'unknown_error'] },
    }));
  return true;
});
