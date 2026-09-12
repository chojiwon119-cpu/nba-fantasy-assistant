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

export interface YahooObservedPlayer {
  yahooPlayerId: string;
  name: string;
  nbaTeam?: string;
  eligiblePositions: string[];
  rosterSlot?: string;
  fantasyTeamId?: string;
  availability: YahooAvailability;
  rawStatus?: string;
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

