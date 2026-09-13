import { Player, SCORING_WEIGHTS, YahooTokens } from '@/types';
import { PlayerProjectionV1, ProjectionHorizon } from '@/types/projections';
import { ScoringWeights, scoreStatLine } from './projections';
import { parseInjuryStatus } from './injury-status';
import { DatedPlayerStats, fetchPlayerStatsByDate, fetchPlayerStatsByWeek } from './yahoo';

const MODEL_VERSION = 'yahoo-fpts-v2.0.0';
const MIN_SAMPLE_GAMES = 3;
const LOOKBACK_DAYS = 10;
const LOOKBACK_WEEKS = 6;
const RECENCY_DECAY = 0.88;
const P10_Z = 1.28155;

export interface ProjectionPlayerInput {
  player_key: string;
  name: string;
  team: string;
  status: Player['status'];
  injury_note?: string;
}

export interface ProjectionRunOptions {
  players: ProjectionPlayerInput[];
  horizon: ProjectionHorizon;
  asOf?: Date;
  scoringWeights?: ScoringWeights;
}

export interface ProjectionRunResult {
  provider: string;
  modelVersion: string;
  generatedAt: string;
  horizon: ProjectionHorizon;
  granularity: 'daily' | 'weekly';
  projections: PlayerProjectionV1[];
  warnings: string[];
}

export async function runProjectionModel(tokens: YahooTokens, options: ProjectionRunOptions): Promise<ProjectionRunResult> {
  const asOf = options.asOf ?? new Date();
  const weights = options.scoringWeights ?? SCORING_WEIGHTS;
  const playerKeys = [...new Set(options.players.map((player) => player.player_key))].slice(0, 25);
  const runWarnings: string[] = [];

  const { history, granularity } = await fetchHistory(playerKeys, asOf, tokens, runWarnings);
  const historyByPlayer = groupBy(history, (entry) => entry.playerKey);

  const generatedAt = new Date().toISOString();
  const projections = options.players
    .filter((player) => playerKeys.includes(player.player_key))
    .map((player) => projectPlayer(player, historyByPlayer.get(player.player_key) ?? [], options.horizon, weights, granularity, generatedAt));

  return {
    provider: 'yahoo-fantasy-api',
    modelVersion: MODEL_VERSION,
    generatedAt,
    horizon: options.horizon,
    granularity,
    projections,
    warnings: runWarnings,
  };
}

async function fetchHistory(
  playerKeys: string[],
  asOf: Date,
  tokens: YahooTokens,
  warnings: string[],
): Promise<{ history: DatedPlayerStats[]; granularity: 'daily' | 'weekly' }> {
  const dates = Array.from({ length: LOOKBACK_DAYS }, (_, index) => isoDate(addDays(asOf, -(index + 1))));
  try {
    const batches = await Promise.all(dates.map((date) => fetchPlayerStatsByDate(playerKeys, date, tokens)));
    return { history: batches.flat(), granularity: 'daily' };
  } catch (error) {
    warnings.push('Yahoo가 날짜별(type=date) 스탯 조회를 허용하지 않아 주 단위 스탯으로 대체했습니다. 예측 정밀도가 다소 낮아집니다.');
    console.error('daily stats fetch failed, falling back to weekly', error);
  }

  const weeks = Array.from({ length: LOOKBACK_WEEKS }, (_, index) => index + 1)
    .map((offset) => currentWeekNumber(asOf) - offset)
    .filter((week) => week > 0);
  const batches = await Promise.all(weeks.map((week) => fetchPlayerStatsByWeek(playerKeys, week, tokens)));
  return { history: batches.flat(), granularity: 'weekly' };
}

function projectPlayer(
  player: ProjectionPlayerInput,
  history: DatedPlayerStats[],
  horizon: ProjectionHorizon,
  weights: ScoringWeights,
  granularity: 'daily' | 'weekly',
  generatedAt: string,
): PlayerProjectionV1 {
  const recent = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const warnings: string[] = [];
  const injury = parseInjuryStatus(player.status, player.injury_note);

  if (recent.length < MIN_SAMPLE_GAMES) {
    warnings.push(`최근 유효 ${granularity === 'daily' ? '경기' : '주'} 표본이 ${recent.length}개로 부족합니다.`);
  }

  const weighted = weightedStatLine(recent, weights);
  const historicalScores = recent.map((entry) => scoreStatLine(entry.stats, weights));
  const perSampleSd = standardDeviation(historicalScores);
  const pointsPerActiveGame = round(weighted.pointsPerUnit);

  const dataQuality = quality(recent.length);
  const confidence = confidenceScore(recent.length, granularity);

  return {
    playerId: player.player_key,
    playerName: player.name,
    teamAbbreviation: player.team,
    modelVersion: MODEL_VERSION,
    generatedAt,
    horizon,
    expectedGames: null,
    availabilityProbability: injury.availabilityProbability,
    pointsPerActiveGame,
    expectedTotalPoints: null,
    p10: round(Math.max(0, pointsPerActiveGame - P10_Z * perSampleSd)),
    p50: pointsPerActiveGame,
    p90: round(pointsPerActiveGame + P10_Z * perSampleSd),
    confidence,
    recentGamesUsed: recent.length,
    standardDeviation: round(perSampleSd),
    dataQuality,
    injuryStatus: injury.status,
    warnings,
    modelFactors: {
      formTrend: round(weighted.formTrend, 3),
      recentFormWeight: RECENCY_DECAY,
    },
  };
}

function weightedStatLine(history: DatedPlayerStats[], weights: ScoringWeights): {
  pointsPerUnit: number;
  formTrend: number;
} {
  if (history.length === 0) return { pointsPerUnit: 0, formTrend: 1 };

  let totalWeight = 0;
  let weightedScore = 0;
  history.forEach((entry, index) => {
    const weight = RECENCY_DECAY ** index;
    totalWeight += weight;
    weightedScore += scoreStatLine(entry.stats, weights) * weight;
  });

  // formTrend: recent-half vs older-half scoring, as a simple "trending up/down" signal since
  // there's no minutes-played stat category to derive a usage trend from directly.
  const recentHalf = history.slice(0, Math.max(1, Math.ceil(history.length / 2)));
  const olderHalf = history.slice(recentHalf.length);
  const recentAvg = average(recentHalf.map((entry) => scoreStatLine(entry.stats, weights)));
  const olderAvg = average(olderHalf.map((entry) => scoreStatLine(entry.stats, weights))) || recentAvg;
  const formTrend = clamp(olderAvg > 0 ? recentAvg / olderAvg : 1, 0.5, 2);

  return {
    pointsPerUnit: weightedScore / totalWeight,
    formTrend,
  };
}

function quality(sample: number): PlayerProjectionV1['dataQuality'] {
  if (sample < MIN_SAMPLE_GAMES) return 'insufficient';
  if (sample >= 12) return 'high';
  if (sample >= 6) return 'medium';
  return 'low';
}

function confidenceScore(sample: number, granularity: 'daily' | 'weekly'): number {
  const denominator = granularity === 'daily' ? 15 : 6;
  const sampleScore = clamp(sample / denominator, 0, 1) * 0.85;
  const granularityScore = granularity === 'daily' ? 0.15 : 0.08;
  return round(clamp(sampleScore + granularityScore, 0, 1), 3);
}

function currentWeekNumber(asOf: Date): number {
  // Yahoo's fantasy week 1 always starts on the Monday of the NBA season's opening week.
  // Without a schedule source we can't compute this exactly, so this is a rough ISO-week-based
  // estimate used only for the weekly-fallback lookback window (never surfaced to the user).
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), 9, 15));
  const diffWeeks = Math.floor((asOf.getTime() - start.getTime()) / (7 * 86_400_000));
  return Math.max(1, diffWeeks + 1);
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return values[0] ? Math.abs(values[0]) * 0.3 : 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  items.forEach((item) => {
    const k = key(item);
    const values = result.get(k) ?? [];
    values.push(item);
    result.set(k, values);
  });
  return result;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
