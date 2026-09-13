import { PlayerStats, SCORING_WEIGHTS } from '@/types';

export type ScoringWeights = Record<keyof Omit<PlayerStats, 'GP'>, number>;

export function scoreStatLine(
  stats: Omit<PlayerStats, 'GP'>,
  weights: ScoringWeights = SCORING_WEIGHTS,
): number {
  return (Object.keys(weights) as Array<keyof ScoringWeights>)
    .reduce((total, key) => total + stats[key] * weights[key], 0);
}
