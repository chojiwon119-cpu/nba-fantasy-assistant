export type YahooPageKind =
  | 'league'
  | 'team'
  | 'players'
  | 'transactions'
  | 'draft'
  | 'settings'
  | 'unknown';

export type YahooAvailability =
  | 'ROSTERED'
  | 'FREE_AGENT'
  | 'WAIVER'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

// The subset of Yahoo's own season-average columns (Player List "2025-26 Season (avg)" view)
// that map onto PlayerStats (minus GP, tracked separately). Read directly from Yahoo's table
// since NBA.com and ESPN are both unreachable from Vercel and from this extension's fetches.
export interface YahooSeasonAverage {
  GP: number;
  MPG: number;
  FGM: number; FGA: number;
  FTM: number; FTA: number;
  threePA: number; threePM: number;
  PTS: number; REB: number; AST: number; ST: number; BLK: number; TO: number; DD: number; TD: number;
}

export interface YahooObservedPlayer {
  yahooPlayerId: string;
  name: string;
  nbaTeam?: string;
  eligiblePositions: string[];
  rosterSlot?: string;
  fantasyTeamId?: string;
  availability: YahooAvailability;
  rawStatus?: string;
  seasonAverage?: YahooSeasonAverage;
}

export interface YahooPageSnapshot {
  schemaVersion: 1;
  source: 'yahoo-passive-companion';
  pageKind: YahooPageKind;
  leagueId: string;
  fantasyTeamId?: string;
  pageTitle: string;
  pageUrl: string;
  observedAt: string;
  fingerprint: string;
  players: YahooObservedPlayer[];
}

export type ProjectionHorizon =
  | 'next_game'
  | 'next_7_days'
  | 'next_14_days'
  | 'rest_of_season'
  | 'fantasy_playoffs';

export interface PlayerProjection {
  playerId: string;
  modelVersion: string;
  generatedAt: string;
  horizon: ProjectionHorizon;
  expectedGames: number;
  availabilityProbability: number;
  pointsPerActiveGame: number;
  expectedTotalPoints: number;
  p10: number;
  p50: number;
  p90: number;
  confidence: number;
}

export interface ProjectedGame {
  gameId: string;
  date: string;
  opponentTeamId: string;
  home: boolean;
  backToBack: boolean;
  opponentFactor: number;
  minutesFactor: number;
  availabilityProbability: number;
  expectedPoints: number;
}

export interface PlayerProjectionV1 extends PlayerProjection {
  playerName: string;
  teamAbbreviation: string;
  projectedMinutes: number;
  recentGamesUsed: number;
  standardDeviation: number;
  dataQuality: 'high' | 'medium' | 'low' | 'insufficient';
  injuryStatus?: string;
  games: ProjectedGame[];
  warnings: string[];
  modelFactors: {
    minutesTrend: number;
    recentFormWeight: number;
    scheduleStrength: number;
    backToBackGames: number;
  };
}
