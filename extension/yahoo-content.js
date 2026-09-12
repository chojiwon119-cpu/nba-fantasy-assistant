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

  function extractPlayers() {
    const anchors = [...document.querySelectorAll('a[href]')]
      .filter((anchor) => PLAYER_LINK_PATTERNS.some((pattern) => anchor.href.includes(pattern)));
    const players = new Map();

    for (const anchor of anchors) {
      const name = anchor.textContent?.trim();
      if (!name || name.length < 2) continue;
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
      });
    }

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

    const state = await chrome.storage.local.get('latestYahooSnapshots');
    const previous = Array.isArray(state.latestYahooSnapshots) ? state.latestYahooSnapshots : [];
    const withoutCurrentPage = previous.filter((item) =>
      !(item.leagueId === snapshot.leagueId && item.pageKind === snapshot.pageKind && item.fantasyTeamId === snapshot.fantasyTeamId)
    );
    const latestYahooSnapshots = [...withoutCurrentPage, snapshot]
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 40);

    await chrome.storage.local.set({
      latestYahooSnapshots,
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

