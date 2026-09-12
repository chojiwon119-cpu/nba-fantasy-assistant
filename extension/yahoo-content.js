(() => {
  const PLAYER_LINK_PATTERNS = ['/nba/players/', '/player/'];
  const POSITION_PATTERN = /\b(PG|SG|SF|PF|C|G|F|UTIL|IL\+?|BN)\b/g;
  let lastFingerprint = '';
  let timer;

  function idFromUrl(url, marker) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return url.match(new RegExp(`${escaped}([^/?#]+)`))?.[1] || '';
  }

  function leagueId() {
    return location.pathname.match(/\/nba\/(\d+)/)?.[1] || '';
  }

  function fantasyTeamId() {
    return location.pathname.match(/\/nba\/\d+\/(\d+)(?:\/|$)/)?.[1];
  }

  function pageKind() {
    const path = location.pathname.toLowerCase();
    if (path.includes('draft')) return 'draft';
    if (path.includes('transaction')) return 'transactions';
    if (path.includes('player')) return 'players';
    if (path.includes('setting') || path.includes('commissioner')) return 'settings';
    if (fantasyTeamId()) return 'team';
    if (leagueId()) return 'league';
    return 'unknown';
  }

  function availabilityFrom(text) {
    if (/\b(FA|Free Agent)\b/i.test(text)) return 'FREE_AGENT';
    if (/\b(W|Waiver|Waivers)\b/i.test(text)) return 'WAIVER';
    if (/\b(Pending|Unavailable)\b/i.test(text)) return 'UNAVAILABLE';
    if (fantasyTeamId() || /\b(PG|SG|SF|PF|C|G|F|UTIL|BN|IL\+?)\b/.test(text)) return 'ROSTERED';
    return 'UNKNOWN';
  }

  function playerId(anchor) {
    const href = anchor.href || '';
    for (const pattern of PLAYER_LINK_PATTERNS) {
      const found = idFromUrl(href, pattern);
      if (found) return found;
    }
    return href || anchor.textContent.trim();
  }

  // Yahoo's own Player List already shows season-average per-game stats (MPG, FGM/FGA,
  // FTM/FTA, 3PTA/3PTM, PTS/REB/AST/ST/BLK/TO/DD/TD) in a data table. Reading those directly
  // means the projection model doesn't need any external stats source at all — external NBA
  // data providers (NBA.com, ESPN) are blocked from both Vercel and, it turns out, this
  // extension's own fetches, so this sidesteps that dead end entirely.
  const STAT_LABEL_MAP = {
    'gp*': 'GP', gp: 'GP',
    mpg: 'MPG',
    fgm: 'FGM', fga: 'FGA',
    ftm: 'FTM', fta: 'FTA',
    '3pta': 'threePA', '3ptm': 'threePM',
    pts: 'PTS', reb: 'REB', ast: 'AST', st: 'ST', blk: 'BLK', to: 'TO', dd: 'DD', td: 'TD',
  };
  const headerLabelsByTable = new Map();

  function headerLabelsFor(table) {
    if (!table) return [];
    if (headerLabelsByTable.has(table)) return headerLabelsByTable.get(table);
    const headerRows = [...table.querySelectorAll('thead tr')];
    const lastRow = headerRows[headerRows.length - 1];
    const labels = lastRow
      ? [...lastRow.children].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim().toLowerCase())
      : [];
    headerLabelsByTable.set(table, labels);
    return labels;
  }

  function extractSeasonAverage(row) {
    if (!row || row.tagName !== 'TR') return undefined;
    const table = row.closest('table');
    const labels = headerLabelsFor(table);
    const cells = [...row.children];
    if (labels.length === 0 || labels.length !== cells.length) return undefined;

    const stats = {};
    labels.forEach((label, index) => {
      const key = STAT_LABEL_MAP[label];
      if (!key) return;
      const raw = cells[index]?.textContent?.trim();
      if (!raw || raw === '—' || raw === '-') return;
      const value = Number(raw.replace('%', ''));
      if (Number.isFinite(value)) stats[key] = value;
    });
    // Require at least GP plus a couple of real stat columns before trusting this row as a
    // season-average line, so a table that merely happens to have the same column count
    // (e.g. no stats columns matched at all) doesn't produce a bogus all-zero stat line.
    if (stats.GP === undefined || Object.keys(stats).length < 4) return undefined;
    return stats;
  }

  function extractPlayers() {
    const anchors = [...document.querySelectorAll('a[href]')]
      .filter((anchor) => PLAYER_LINK_PATTERNS.some((pattern) => anchor.href.includes(pattern)));
    const players = new Map();

    for (const anchor of anchors) {
      const name = anchor.textContent?.trim();
      if (!name || name.length < 2) continue;
      // Yahoo's player rows also include a "Player Note" / "No new player Notes" link that
      // happens to resolve to the same player id as the real name link — without this guard
      // it can overwrite the correct name in the map below (Map.set with the same key wins
      // on whichever anchor is visited last in DOM order).
      if (/\bnotes?\b/i.test(name)) continue;
      const row = anchor.closest('tr') || anchor.closest('[role="row"]') || anchor.parentElement;
      const rowText = row?.textContent?.replace(/\s+/g, ' ').trim() || name;
      const positions = [...new Set(rowText.match(POSITION_PATTERN) || [])];
      const teamToken = rowText.match(/\b(ATL|BOS|BKN|CHA|CHI|CLE|DAL|DEN|DET|GSW|HOU|IND|LAC|LAL|MEM|MIA|MIL|MIN|NOP|NYK|OKC|ORL|PHI|PHX|POR|SAC|SAS|TOR|UTA|WAS)\b/)?.[1];
      const slot = positions.find((position) => ['PG','SG','SF','PF','C','G','F','UTIL','BN','IL','IL+'].includes(position));
      const id = playerId(anchor);

      players.set(id, {
        yahooPlayerId: id,
        name,
        nbaTeam: teamToken,
        eligiblePositions: positions.filter((position) => !['UTIL','BN','IL','IL+'].includes(position)),
        rosterSlot: slot,
        fantasyTeamId: fantasyTeamId(),
        availability: availabilityFrom(rowText),
        rawStatus: rowText.slice(0, 300),
        seasonAverage: extractSeasonAverage(row),
      });
    }

    headerLabelsByTable.clear();
    return [...players.values()];
  }

  function hash(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(16);
  }

  async function capture() {
    const currentLeagueId = leagueId();
    if (!currentLeagueId) return;
    const players = extractPlayers();
    if (players.length === 0) return;

    const fingerprint = hash(JSON.stringify({
      url: location.href,
      players,
    }));
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;

    const snapshot = {
      schemaVersion: 1,
      source: 'yahoo-passive-companion',
      pageKind: pageKind(),
      leagueId: currentLeagueId,
      fantasyTeamId: fantasyTeamId(),
      pageTitle: document.title,
      pageUrl: location.href,
      observedAt: new Date().toISOString(),
      fingerprint,
      players,
    };

    const state = await chrome.storage.local.get(['latestYahooSnapshots', 'yahooPlayerDirectories']);
    const previous = Array.isArray(state.latestYahooSnapshots) ? state.latestYahooSnapshots : [];
    // Keyed by the exact page URL so distinct paginated pages are kept as separate metadata
    // entries; revisiting the same URL still refreshes just that one entry.
    const withoutCurrentPage = previous.filter((item) => item.pageUrl !== snapshot.pageUrl);
    const latestYahooSnapshots = [...withoutCurrentPage, snapshot]
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 40);

    // Some Yahoo list views (Players/FA) page through results without changing the URL at
    // all — they just swap the table contents via JS. Relying on per-page snapshots alone
    // would then have each page overwrite the last regardless of the URL-based dedup above.
    // So player identities are additionally accumulated into a per-league running directory,
    // upserted one player at a time, which survives however Yahoo chooses to paginate.
    const directories = state.yahooPlayerDirectories && typeof state.yahooPlayerDirectories === 'object'
      ? state.yahooPlayerDirectories
      : {};
    const existingDirectory = directories[currentLeagueId]?.players || {};
    const mergedPlayers = { ...existingDirectory };
    players.forEach((player) => { mergedPlayers[player.yahooPlayerId] = player; });
    const yahooPlayerDirectories = {
      ...directories,
      [currentLeagueId]: { updatedAt: snapshot.observedAt, players: mergedPlayers },
    };

    await chrome.storage.local.set({
      latestYahooSnapshots,
      yahooPlayerDirectories,
      lastYahooSyncAt: snapshot.observedAt,
    });
  }

  function scheduleCapture() {
    clearTimeout(timer);
    timer = setTimeout(capture, 1200);
  }

  scheduleCapture();
  const observer = new MutationObserver(scheduleCapture);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

