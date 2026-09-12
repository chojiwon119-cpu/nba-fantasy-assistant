import { PlayerStats, SCORING_WEIGHTS } from '@/types';
import { PlayerProjectionV1, ProjectionHorizon, ProjectedGame } from '@/types/companion';
import { ScoringWeights, scoreStatLine } from './projections';
import {
  NBADataProvider,
  NBAGame,
  NBAInjury,
  NBAPlayerGameStat,
  NBAPlayerIdentity,
  NBAProviderError,
} from './nba-data';

const MODEL_VERSION = 'nba-fpts-v1.0.0';
const MIN_SAMPLE_GAMES = 3;
const MAX_RECENT_GAMES = 15;
const RECENCY_DECAY = 0.88;
const P10_Z = 1.28155;

export interface ProjectionRunOptions {
  playerIds: string[];
  horizon: ProjectionHorizon;
  asOf?: Date;
  scoringWeights?: ScoringWeights;
}

export interface ProjectionRunResult {
  provider: string;
  modelVersion: string;
  generatedAt: string;
  asOf: string;
  horizon: ProjectionHorizon;
  projections: PlayerProjectionV1[];
  warnings: string[];
  dataFreshness: {
    statsThrough?: string;
    scheduleThrough: string;
    injuryData: 'available' | 'unavailable';
  };
}

export async function runProjectionModel(
  provider: NBADataProvider,
  options: ProjectionRunOptions,
): Promise<ProjectionRunResult> {
  const asOf = startOfUtcDay(options.asOf ?? new Date());
  const range = horizonRange(asOf, options.horizon);
  const historyStart = addDays(asOf, -180);
  const playerIds = [...new Set(options.playerIds)].slice(0, 25);
  const weights = options.scoringWeights ?? SCORING_WEIGHTS;

  const [players, stats, games] = await Promise.all([
    provider.getPlayersByIds(playerIds),
    provider.getPlayerGameStats(playerIds, { startDate: isoDate(historyStart), endDate: isoDate(addDays(asOf, -1)) }),
    provider.getGames({ startDate: isoDate(addDays(asOf, -45)), endDate: isoDate(range.end) }),
  ]);

  let injuries: NBAInjury[] = [];
  let injuryData: ProjectionRunResult['dataFreshness']['injuryData'] = 'available';
  const runWarnings: string[] = [];
  try {
    injuries = await provider.getPlayerInjuries(playerIds);
  } catch (error) {
    injuryData = 'unavailable';
    if (error instanceof NBAProviderError && error.code === 'UNAUTHORIZED') {
      runWarnings.push('현재 API 요금제에서 부상 데이터에 접근할 수 없어 출전확률을 보수적으로 기본값 처리했습니다.');
    } else {
      runWarnings.push('부상 데이터를 불러오지 못해 출전확률에 최신 부상 정보가 반영되지 않았습니다.');
    }
  }

  const defenseFactors = buildOpponentFactors(games, asOf);
  const statsByPlayer = groupBy(stats, (stat) => stat.playerId);
  const injuryByPlayer = new Map(injuries.map((injury) => [injury.playerId, injury]));
  const playerById = new Map(players.map((player) => [player.id, player]));

  const projections = playerIds.map((playerId) => {
    const playerStats = statsByPlayer.get(playerId) ?? [];
    const latestStat = [...playerStats].sort((a, b) => b.date.localeCompare(a.date))[0];
    const identity = playerById.get(playerId) ?? unknownPlayer(playerId);
    const player = identity.teamId ? identity : {
      ...identity,
      teamId: latestStat?.teamId ?? '',
      teamAbbreviation: latestStat?.teamAbbreviation ?? identity.teamAbbreviation,
    };
    const allScheduledGames = games
      .filter((game) => game.status === 'scheduled' && game.date >= isoDate(range.start) && game.date <= isoDate(range.end))
      .filter((game) => game.homeTeamId === player.teamId || game.visitorTeamId === player.teamId)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
    const schedule = options.horizon === 'next_game' ? allScheduledGames.slice(0, 1) : allScheduledGames;
    return projectPlayer(player, playerStats, schedule, injuryByPlayer.get(playerId), defenseFactors, options.horizon, weights);
  });

  const statsThrough = stats.map((stat) => stat.date).sort().at(-1);
  return {
    provider: provider.displayName,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    asOf: isoDate(asOf),
    horizon: options.horizon,
    projections,
    warnings: runWarnings,
    dataFreshness: {
      statsThrough,
      scheduleThrough: isoDate(range.end),
      injuryData,
    },
  };
}

function projectPlayer(
  player: NBAPlayerIdentity,
  allStats: NBAPlayerGameStat[],
  schedule: NBAGame[],
  injury: NBAInjury | undefined,
  defenseFactors: Map<string, number>,
  horizon: ProjectionHorizon,
  weights: ScoringWeights,
): PlayerProjectionV1 {
  const recent = allStats
    .filter((stat) => stat.minutes >= 5)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_RECENT_GAMES);
  const warnings: string[] = [];
  const availability = injuryAvailability(injury?.status);

  if (recent.length < MIN_SAMPLE_GAMES) {
    warnings.push(`최근 유효 경기 표본이 ${recent.length}경기로 부족합니다.`);
  }
  if (!injury) warnings.push('확인 가능한 부상 기록이 없어 기본 출전확률을 사용했습니다.');
  if (schedule.length === 0) warnings.push('선택 기간에 예정된 경기가 없습니다.');

  const weighted = weightedRates(recent);
  const basePoints = scoreStatLine(weighted.projectedStats, weights);
  const historicalScores = recent.map((stat) => scoreStatLine(stat.stats, weights));
  const perGameSd = standardDeviation(historicalScores);
  const projectedGames: ProjectedGame[] = schedule.map((game, index) => {
    const home = game.homeTeamId === player.teamId;
    const opponentTeamId = home ? game.visitorTeamId : game.homeTeamId;
    const backToBack = index > 0 && daysBetween(schedule[index - 1].date, game.date) === 1;
    const opponentFactor = defenseFactors.get(opponentTeamId) ?? 1;
    const minutesFactor = (home ? 1.01 : 0.99) * (backToBack ? 0.97 : 1);
    return {
      gameId: game.id,
      date: game.date,
      opponentTeamId,
      home,
      backToBack,
      opponentFactor: round(opponentFactor, 3),
      minutesFactor: round(minutesFactor, 3),
      availabilityProbability: availability,
      expectedPoints: round(Math.max(0, basePoints * opponentFactor * minutesFactor * availability)),
    };
  });

  const expectedTotal = projectedGames.reduce((sum, game) => sum + game.expectedPoints, 0);
  const conditionalMeans = projectedGames.map((game) => availability > 0 ? game.expectedPoints / availability : 0);
  const variance = conditionalMeans.reduce((sum, mean) => (
    sum + availability * perGameSd ** 2 + availability * (1 - availability) * mean ** 2
  ), 0);
  const totalSd = Math.sqrt(Math.max(0, variance));
  const averageOpponentFactor = average(projectedGames.map((game) => game.opponentFactor)) || 1;
  const dataQuality = quality(recent.length, schedule.length, injury !== undefined);
  const confidence = confidenceScore(recent.length, schedule.length, injury !== undefined);

  return {
    playerId: player.id,
    playerName: player.name,
    teamAbbreviation: player.teamAbbreviation,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    horizon,
    expectedGames: schedule.length,
    availabilityProbability: availability,
    pointsPerActiveGame: round(basePoints),
    expectedTotalPoints: round(expectedTotal),
    p10: round(Math.max(0, expectedTotal - P10_Z * totalSd)),
    p50: round(expectedTotal),
    p90: round(expectedTotal + P10_Z * totalSd),
    confidence,
    projectedMinutes: round(weighted.projectedMinutes),
    recentGamesUsed: recent.length,
    standardDeviation: round(totalSd),
    dataQuality,
    injuryStatus: injury?.status,
    games: projectedGames,
    warnings,
    modelFactors: {
      minutesTrend: round(weighted.minutesTrend, 3),
      recentFormWeight: RECENCY_DECAY,
      scheduleStrength: round(averageOpponentFactor, 3),
      backToBackGames: projectedGames.filter((game) => game.backToBack).length,
    },
  };
}

function weightedRates(stats: NBAPlayerGameStat[]): {
  projectedStats: Omit<PlayerStats, 'GP'>;
  projectedMinutes: number;
  minutesTrend: number;
} {
  const keys = Object.keys(SCORING_WEIGHTS) as Array<keyof Omit<PlayerStats, 'GP'>>;
  const empty = Object.fromEntries(keys.map((key) => [key, 0])) as Omit<PlayerStats, 'GP'>;
  if (stats.length === 0) return { projectedStats: empty, projectedMinutes: 0, minutesTrend: 1 };

  let totalWeight = 0;
  let weightedMinutes = 0;
  const weightedPerMinute = { ...empty };
  stats.forEach((game, index) => {
    const weight = RECENCY_DECAY ** index;
    totalWeight += weight;
    weightedMinutes += game.minutes * weight;
    keys.forEach((key) => {
      weightedPerMinute[key] += (game.stats[key] / game.minutes) * weight;
    });
  });

  const baselineMinutes = weightedMinutes / totalWeight;
  const recentMinutes = average(stats.slice(0, Math.min(5, stats.length)).map((stat) => stat.minutes));
  const olderMinutes = average(stats.slice(5).map((stat) => stat.minutes)) || baselineMinutes;
  const minutesTrend = clamp(olderMinutes > 0 ? recentMinutes / olderMinutes : 1, 0.9, 1.1);
  const projectedMinutes = clamp(baselineMinutes * (0.7 + 0.3 * minutesTrend), 0, 42);
  const projectedStats = { ...empty };
  keys.forEach((key) => {
    projectedStats[key] = (weightedPerMinute[key] / totalWeight) * projectedMinutes;
  });
  return { projectedStats, projectedMinutes, minutesTrend };
}

function buildOpponentFactors(games: NBAGame[], asOf: Date): Map<string, number> {
  const completed = games.filter((game) => game.status === 'final' && game.date < isoDate(asOf));
  const allowed = new Map<string, number[]>();
  completed.forEach((game) => {
    pushMap(allowed, game.homeTeamId, game.visitorTeamScore);
    pushMap(allowed, game.visitorTeamId, game.homeTeamScore);
  });
  const allAllowed = [...allowed.values()].flat();
  const leagueAverage = average(allAllowed);
  const factors = new Map<string, number>();
  if (!leagueAverage) return factors;
  allowed.forEach((values, teamId) => {
    factors.set(teamId, clamp(average(values) / leagueAverage, 0.94, 1.06));
  });
  return factors;
}

function injuryAvailability(status?: string): number {
  if (!status) return 0.97;
  const normalized = status.toLowerCase();
  if (normalized.includes('out')) return 0.03;
  if (normalized.includes('doubt')) return 0.25;
  if (normalized.includes('question')) return 0.6;
  if (normalized.includes('prob')) return 0.9;
  if (normalized.includes('available') || normalized.includes('active')) return 0.99;
  return 0.85;
}

function horizonRange(asOf: Date, horizon: ProjectionHorizon): { start: Date; end: Date } {
  const days: Record<ProjectionHorizon, number> = {
    next_game: 7,
    next_7_days: 6,
    next_14_days: 13,
    rest_of_season: 180,
    fantasy_playoffs: 28,
  };
  return { start: asOf, end: addDays(asOf, days[horizon]) };
}

function quality(sample: number, schedule: number, hasInjury: boolean): PlayerProjectionV1['dataQuality'] {
  if (sample < MIN_SAMPLE_GAMES) return 'insufficient';
  if (sample >= 12 && schedule > 0 && hasInjury) return 'high';
  if (sample >= 7 && schedule > 0) return 'medium';
  return 'low';
}

function confidenceScore(sample: number, schedule: number, hasInjury: boolean): number {
  const sampleScore = clamp(sample / 12, 0, 1) * 0.65;
  const scheduleScore = schedule > 0 ? 0.2 : 0.05;
  const injuryScore = hasInjury ? 0.15 : 0.05;
  return round(clamp(sampleScore + scheduleScore + injuryScore, 0, 1), 3);
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return values[0] ? Math.abs(values[0]) * 0.3 : 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  items.forEach((item) => pushMap(result, key(item), item));
  return result;
}

function pushMap<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function unknownPlayer(id: string): NBAPlayerIdentity {
  return { id, name: `Unknown player ${id}`, teamId: '', teamAbbreviation: '', positions: [] };
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string): number {
  return Math.round((new Date(`${right}T00:00:00Z`).getTime() - new Date(`${left}T00:00:00Z`).getTime()) / 86_400_000);
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
