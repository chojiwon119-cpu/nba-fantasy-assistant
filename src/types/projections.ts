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
  expectedGames: number | null;
  availabilityProbability: number;
  pointsPerActiveGame: number;
  expectedTotalPoints: number | null;
  p10: number;
  p50: number;
  p90: number;
  confidence: number;
}

export interface PlayerProjectionV1 extends PlayerProjection {
  playerName: string;
  teamAbbreviation: string;
  recentGamesUsed: number;
  standardDeviation: number;
  dataQuality: 'high' | 'medium' | 'low' | 'insufficient';
  injuryStatus?: string;
  warnings: string[];
  modelFactors: {
    formTrend: number;
    recentFormWeight: number;
  };
}
