import { NextRequest, NextResponse } from 'next/server';
import { PlayerStats, SCORING_WEIGHTS } from '@/types';
import { scoreStatLine } from '@/lib/projections';
import { parseYahooInjuryStatus } from '@/lib/nba-data/injury-status';

// NBA.com and ESPN are both unreachable (403/blocked) from Vercel and from the Chrome
// Companion's own fetches alike, so this route does not call out to any external NBA data
// source. It only scores the season-average stat line Yahoo's own Player List already shows
// (read client-side by yahoo-content.js) against however many games the player's team has in
// the requested window (looked up from the extension's bundled schedule — see
// scripts/build-schedule.cjs). No per-game history means no measured game-to-game variance,
// so the P10/P90 spread here is a documented heuristic (ROUGH_GAME_SD_RATIO), not something
// derived from real data — it is reported as such via dataQuality/warnings, never hidden.

const MAX_PLAYERS = 60;
const MODEL_VERSION = 'nba-fpts-v1.1.0-season-avg';
const ROUGH_GAME_SD_RATIO = 0.32;
const P10_Z = 1.28155;
const STAT_KEYS: Array<keyof Omit<PlayerStats, 'GP'>> = [
  'FGA', 'FGM', 'FTA', 'FTM', 'threePA', 'threePM', 'PTS', 'REB', 'AST', 'ST', 'BLK', 'TO', 'DD', 'TD',
];
const STAT_CAPS: Record<keyof Omit<PlayerStats, 'GP'>, number> = {
  FGA: 45, FGM: 30, FTA: 30, FTM: 30, threePA: 20, threePM: 15,
  PTS: 70, REB: 30, AST: 25, ST: 10, BLK: 10, TO: 15, DD: 3, TD: 3,
};

interface RawSeasonAverage {
  GP?: unknown; MPG?: unknown;
  FGA?: unknown; FGM?: unknown; FTA?: unknown; FTM?: unknown;
  threePA?: unknown; threePM?: unknown;
  PTS?: unknown; REB?: unknown; AST?: unknown; ST?: unknown; BLK?: unknown; TO?: unknown; DD?: unknown; TD?: unknown;
}
interface RawPlayer {
  yahooPlayerId?: unknown;
  name?: unknown;
  team?: unknown;
  rawStatus?: unknown;
  gamesInWindow?: unknown;
  seasonAverage?: RawSeasonAverage;
}
interface RequestBody {
  players?: RawPlayer[];
  scheduleCoverage?: { start?: unknown; end?: unknown } | null;
  windowStart?: unknown;
  windowEnd?: unknown;
}

interface CompanionProjection {
  playerId: string;
  playerName: string;
  team: string;
  modelVersion: string;
  generatedAt: string;
  gamesInWindow: number;
  gamesPlayedThisSeason: number;
  availabilityProbability: number;
  pointsPerActiveGame: number;
  expectedTotalPoints: number;
  p10: number;
  p50: number;
  p90: number;
  confidence: number;
  dataQuality: 'high' | 'medium' | 'low' | 'insufficient';
  injuryStatus: string;
  warnings: string[];
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function finiteNonNegative(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function sanitizeSeasonAverage(raw: RawSeasonAverage | undefined): { stats: Omit<PlayerStats, 'GP'>; gp: number; mpg: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const gp = finiteNonNegative(raw.GP, 100);
  if (gp <= 0) return null;
  const mpg = finiteNonNegative(raw.MPG, 48);
  const stats = Object.fromEntries(
    STAT_KEYS.map((key) => [key, finiteNonNegative(raw[key], STAT_CAPS[key])]),
  ) as Omit<PlayerStats, 'GP'>;
  return { stats, gp, mpg };
}

function dataQuality(gp: number, gamesInWindow: number): CompanionProjection['dataQuality'] {
  if (gp < 3) return 'insufficient';
  if (gp >= 15 && gamesInWindow > 0) return 'high';
  if (gp >= 7 && gamesInWindow > 0) return 'medium';
  return 'low';
}

function confidenceScore(gp: number, gamesInWindow: number, hasStatus: boolean): number {
  const sampleScore = Math.min(1, gp / 20) * 0.6;
  const scheduleScore = gamesInWindow > 0 ? 0.25 : 0.05;
  const statusScore = hasStatus ? 0.15 : 0.05;
  return round(Math.min(1, sampleScore + scheduleScore + statusScore), 3);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const rawPlayers = Array.isArray(body.players) ? body.players.slice(0, MAX_PLAYERS) : [];
  if (rawPlayers.length === 0) {
    return NextResponse.json({ error: '선수 데이터가 필요합니다.' }, { status: 400 });
  }

  const scheduleCoverage = body.scheduleCoverage && typeof body.scheduleCoverage.start === 'string' && typeof body.scheduleCoverage.end === 'string'
    ? { start: body.scheduleCoverage.start, end: body.scheduleCoverage.end }
    : null;
  const windowStart = typeof body.windowStart === 'string' ? body.windowStart : undefined;
  const windowEnd = typeof body.windowEnd === 'string' ? body.windowEnd : undefined;

  const warnings: string[] = [];
  if (scheduleCoverage && windowStart && windowEnd && (windowEnd < scheduleCoverage.start || windowStart > scheduleCoverage.end)) {
    warnings.push(`요청한 기간(${windowStart}~${windowEnd})은 번들된 일정 데이터 범위(${scheduleCoverage.start}~${scheduleCoverage.end}) 밖입니다. 비시즌이거나 일정 파일을 다시 받아야 할 수 있습니다. 경기 수는 0으로 처리했습니다.`);
  }

  const generatedAt = new Date().toISOString();
  const projections: CompanionProjection[] = [];

  for (const raw of rawPlayers) {
    const yahooPlayerId = str(raw.yahooPlayerId, 100);
    const name = str(raw.name, 100);
    if (!yahooPlayerId || !name) continue;

    const seasonAverage = sanitizeSeasonAverage(raw.seasonAverage);
    const gamesInWindow = Math.round(finiteNonNegative(raw.gamesInWindow, 20));
    const parsedStatus = parseYahooInjuryStatus(str(raw.rawStatus, 300));
    const playerWarnings: string[] = [];

    if (!seasonAverage) {
      projections.push({
        playerId: yahooPlayerId,
        playerName: name,
        team: str(raw.team, 10),
        modelVersion: MODEL_VERSION,
        generatedAt,
        gamesInWindow,
        gamesPlayedThisSeason: 0,
        availabilityProbability: parsedStatus.availabilityProbability,
        pointsPerActiveGame: 0,
        expectedTotalPoints: 0,
        p10: 0, p50: 0, p90: 0,
        confidence: 0,
        dataQuality: 'insufficient',
        injuryStatus: parsedStatus.status,
        warnings: ['이 선수의 시즌 평균 스탯을 야후 화면에서 읽지 못해 예측을 계산하지 않았습니다.'],
      });
      continue;
    }

    if (parsedStatus.note) playerWarnings.push('Yahoo 상태 텍스트를 인식하지 못해 보수적인 기본 출전확률을 사용했습니다.');
    if (gamesInWindow === 0) playerWarnings.push('선택한 기간에 예정된 경기가 없습니다 (비시즌이거나 이번 주 휴식일 수 있습니다).');

    const pointsPerActiveGame = round(scoreStatLine(seasonAverage.stats, SCORING_WEIGHTS));
    const expectedTotalPoints = round(Math.max(0, pointsPerActiveGame * gamesInWindow * parsedStatus.availabilityProbability));
    const perGameSD = Math.abs(pointsPerActiveGame) * ROUGH_GAME_SD_RATIO;
    const availability = parsedStatus.availabilityProbability;
    const variance = gamesInWindow > 0
      ? gamesInWindow * availability * perGameSD ** 2 + gamesInWindow * availability * (1 - availability) * pointsPerActiveGame ** 2
      : 0;
    const totalSD = Math.sqrt(Math.max(0, variance));

    projections.push({
      playerId: yahooPlayerId,
      playerName: name,
      team: str(raw.team, 10),
      modelVersion: MODEL_VERSION,
      generatedAt,
      gamesInWindow,
      gamesPlayedThisSeason: seasonAverage.gp,
      availabilityProbability: availability,
      pointsPerActiveGame,
      expectedTotalPoints,
      p10: round(Math.max(0, expectedTotalPoints - P10_Z * totalSD)),
      p50: expectedTotalPoints,
      p90: round(expectedTotalPoints + P10_Z * totalSD),
      confidence: confidenceScore(seasonAverage.gp, gamesInWindow, Boolean(raw.rawStatus)),
      dataQuality: dataQuality(seasonAverage.gp, gamesInWindow),
      injuryStatus: parsedStatus.status,
      warnings: playerWarnings,
    });
  }

  return NextResponse.json({
    provider: 'yahoo-season-average',
    modelVersion: MODEL_VERSION,
    generatedAt,
    scheduleCoverage,
    projections,
    warnings,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
