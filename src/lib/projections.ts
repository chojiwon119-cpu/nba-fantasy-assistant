import { PlayerStats, SCORING_WEIGHTS } from '@/types';
import { PlayerProjection, ProjectionHorizon } from '@/types/companion';

export type ScoringWeights = Record<keyof Omit<PlayerStats, 'GP'>, number>;

export interface ProjectionInput {
  playerId: string;
  horizon: ProjectionHorizon;
  perGameStats: Omit<PlayerStats, 'GP'>;
  expectedGames: number;
  availabilityProbability: number;
  volatility: number;
  confidence: number;
  modelVersion: string;
  generatedAt?: string;
}

export function scoreStatLine(
  stats: Omit<PlayerStats, 'GP'>,
  weights: ScoringWeights = SCORING_WEIGHTS,
): number {
  return (Object.keys(weights) as Array<keyof ScoringWeights>)
    .reduce((total, key) => total + stats[key] * weights[key], 0);
}

export function buildProjection(
  input: ProjectionInput,
  weights: ScoringWeights = SCORING_WEIGHTS,
): PlayerProjection {
  const pointsPerActiveGame = scoreStatLine(input.perGameStats, weights);
  const expectedTotalPoints =
    pointsPerActiveGame * input.expectedGames * input.availabilityProbability;
  const spread = Math.max(0, expectedTotalPoints * Math.max(0, input.volatility));

  return {
    playerId: input.playerId,
    modelVersion: input.modelVersion,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    horizon: input.horizon,
    expectedGames: input.expectedGames,
    availabilityProbability: input.availabilityProbability,
    pointsPerActiveGame: round(pointsPerActiveGame),
    expectedTotalPoints: round(expectedTotalPoints),
    p10: round(Math.max(0, expectedTotalPoints - spread)),
    p50: round(expectedTotalPoints),
    p90: round(expectedTotalPoints + spread),
    confidence: clamp(input.confidence, 0, 1),
  };
}

export function incrementalTeamValue(after: number, before: number): number {
  return round(after - before);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

