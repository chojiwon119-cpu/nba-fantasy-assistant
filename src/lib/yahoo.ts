import { YahooTokens, Player, Team, League, PlayerStats, SCORING_WEIGHTS } from '@/types';
import { cookies } from 'next/headers';

const YAHOO_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

export function calculateFantasyScore(stats: PlayerStats): number {
  return (
    stats.FGA * SCORING_WEIGHTS.FGA +
    stats.FGM * SCORING_WEIGHTS.FGM +
    stats.FTA * SCORING_WEIGHTS.FTA +
    stats.FTM * SCORING_WEIGHTS.FTM +
    stats.threePA * SCORING_WEIGHTS.threePA +
    stats.threePM * SCORING_WEIGHTS.threePM +
    stats.PTS * SCORING_WEIGHTS.PTS +
    stats.REB * SCORING_WEIGHTS.REB +
    stats.AST * SCORING_WEIGHTS.AST +
    stats.ST * SCORING_WEIGHTS.ST +
    stats.BLK * SCORING_WEIGHTS.BLK +
    stats.TO * SCORING_WEIGHTS.TO +
    stats.DD * SCORING_WEIGHTS.DD +
    stats.TD * SCORING_WEIGHTS.TD
  );
}

export async function getTokens(): Promise<YahooTokens | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('yahoo_tokens')?.value;
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function refreshTokens(refreshToken: string): Promise<YahooTokens> {
  const creds = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', redirect_uri: process.env.YAHOO_REDIRECT_URI!, refresh_token: refreshToken }),
  });
  const data = await res.json();
  return { ...data, expires_at: Date.now() + data.expires_in * 1000 };
}

export async function getValidTokens(): Promise<YahooTokens | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 60000) return tokens;
  return refreshTokens(tokens.refresh_token);
}

async function yahooFetch(path: string, tokens: YahooTokens) {
  const res = await fetch(`${YAHOO_BASE}${path}?format=json`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!res.ok) throw new Error(`Yahoo API ${res.status}: ${await res.text()}`);
  return res.json();
}

const STAT_ID_MAP: Record<string, keyof PlayerStats> = {
  '5':'FGA','6':'FGM','8':'FTA','9':'FTM','10':'threePA','11':'threePM',
  '12':'PTS','15':'REB','16':'AST','17':'ST','18':'BLK','19':'TO','20':'DD','21':'TD',
};

export function parseStats(statArr: {stat_id: string; value: string}[]): PlayerStats {
  const s: PlayerStats = {FGA:0,FGM:0,FTA:0,FTM:0,threePA:0,threePM:0,PTS:0,REB:0,AST:0,ST:0,BLK:0,TO:0,DD:0,TD:0,GP:0};
  for (const stat of statArr) {
    const key = STAT_ID_MAP[stat.stat_id];
    if (key) s[key] = parseFloat(stat.value) || 0;
    if (stat.stat_id === '0') s.GP = parseFloat(stat.value) || 0;
  }
  return s;
}

export async function fetchLeagues(tokens: YahooTokens): Promise<League[]> {
  const data = await yahooFetch('/users;use_login=1/games;game_codes=nba/leagues', tokens);
  const gamesData = data?.fantasy_content?.users?.[0]?.user?.[1]?.games;
  if (!gamesData) return [];
  const leagues: League[] = [];
  const gameCount = gamesData?.['@count'] || 0;
  for (let i = 0; i < gameCount; i++) {
    const game = gamesData[i]?.game;
    if (!game) continue;
    const leaguesData = game[1]?.leagues;
    const leagueCount = leaguesData?.['@count'] || 0;
    for (let j = 0; j < leagueCount; j++) {
      const league = leaguesData[j]?.league?.[0];
      if (!league) continue;
      leagues.push({ league_key: league.league_key, league_id: league.league_id, name: league.name, season: league.season, num_teams: league.num_teams, current_week: league.current_week || 1, scoring_type: league.scoring_type || 'head' });
    }
  }
  return leagues;
}

export async function fetchMyTeam(leagueKey: string, tokens: YahooTokens): Promise<Team | null> {
  const data = await yahooFetch(`/league/${leagueKey}/teams;mine=1/roster/players`, tokens);
  const teamsData = data?.fantasy_content?.league?.[1]?.teams;
  if (!teamsData) return null;
  const team = teamsData[0]?.team;
  if (!team) return null;
  const teamInfo = team[0];
  const rosterPlayers = team[1]?.roster?.players || {};
  const playerCount = rosterPlayers['@count'] || 0;
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const p = rosterPlayers[i]?.player;
    if (!p) continue;
    const info = p[0];
    const positions = Array.isArray(info.eligible_positions?.position) ? info.eligible_positions.position : [info.eligible_positions?.position || 'UTIL'];
    players.push({
      player_key: info.player_key, player_id: info.player_id, name: info.name?.full || 'Unknown',
      team: info.editorial_team_abbr || '', positions, status: (info.status || 'active').toLowerCase() as Player['status'],
      injury_note: info.injury_note, headshot_url: info.image_url,
      stats: {FGA:0,FGM:0,FTA:0,FTM:0,threePA:0,threePM:0,PTS:0,REB:0,AST:0,ST:0,BLK:0,TO:0,DD:0,TD:0,GP:0},
      roster_position: p[1]?.selected_position?.position || 'BN', is_starting: p[1]?.selected_position?.position !== 'BN',
    });
  }
  return { team_key: teamInfo.team_key, team_id: teamInfo.team_id, name: teamInfo.name, manager: teamInfo.managers?.manager?.nickname || 'Me', roster: players, is_my_team: true };
}

export async function fetchFreeAgents(leagueKey: string, tokens: YahooTokens, count = 50): Promise<Player[]> {
  const data = await yahooFetch(`/league/${leagueKey}/players;status=FA;sort=PTS;count=${count}/stats`, tokens);
  const players = data?.fantasy_content?.league?.[1]?.players;
  if (!players) return [];
  const results: Player[] = [];
  const total = players['@count'] || 0;
  for (let i = 0; i < total; i++) {
    const p = players[i]?.player;
    if (!p) continue;
    const info = p[0];
    const stats = parseStats(p[1]?.player_stats?.stats?.stat || []);
    const player: Player = {
      player_key: info.player_key, player_id: info.player_id, name: info.name?.full || 'Unknown',
      team: info.editorial_team_abbr || '',
      positions: Array.isArray(info.eligible_positions?.position) ? info.eligible_positions.position : [info.eligible_positions?.position || 'UTIL'],
      status: (info.status || 'active').toLowerCase() as Player['status'],
      injury_note: info.injury_note, headshot_url: info.image_url, stats,
      ownership_pct: 0, fantasy_score: calculateFantasyScore(stats),
    };
    results.push(player);
  }
  return results;
}

export function getSnakePickOrder(myPosition: number, totalTeams: number, totalRounds: number): number[] {
  const picks: number[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const isEvenRound = round % 2 === 0;
    const pickInRound = isEvenRound ? totalTeams - myPosition + 1 : myPosition;
    picks.push((round - 1) * totalTeams + pickInRound);
  }
  return picks;
}

export function getNextMyPick(myPosition: number, totalTeams: number, currentOverall: number, draftRosterSize: number): { nextPick: number; picksUntil: number } {
  const myPicks = getSnakePickOrder(myPosition, totalTeams, draftRosterSize);
  const remaining = myPicks.filter(p => p > currentOverall);
  if (remaining.length === 0) return { nextPick: -1, picksUntil: 0 };
  const nextPick = remaining[0];
  return { nextPick, picksUntil: nextPick - currentOverall };
}
