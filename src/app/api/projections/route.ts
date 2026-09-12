import { NextRequest, NextResponse } from 'next/server';
import { getNBADataProvider, NBAProviderError } from '@/lib/nba-data';
import { runProjectionModel } from '@/lib/projection-model';
import { ProjectionHorizon } from '@/types/companion';

const HORIZONS = new Set<ProjectionHorizon>([
  'next_game', 'next_7_days', 'next_14_days', 'rest_of_season', 'fantasy_playoffs',
]);

export async function GET(request: NextRequest) {
  const rawIds = request.nextUrl.searchParams.get('player_ids') ?? '';
  const playerIds = rawIds.split(',').map((value) => value.trim()).filter((value) => /^\d+$/.test(value));
  const rawHorizon = request.nextUrl.searchParams.get('horizon') ?? 'next_7_days';
  const asOfValue = request.nextUrl.searchParams.get('as_of');

  if (playerIds.length === 0) {
    return NextResponse.json({ error: 'player_ids에 BALLDONTLIE 선수 ID가 필요합니다.' }, { status: 400 });
  }
  if (playerIds.length > 25) {
    return NextResponse.json({ error: '한 번에 최대 25명까지 예측할 수 있습니다.' }, { status: 400 });
  }
  if (!HORIZONS.has(rawHorizon as ProjectionHorizon)) {
    return NextResponse.json({ error: '지원하지 않는 horizon입니다.' }, { status: 400 });
  }

  let asOf: Date | undefined;
  if (asOfValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfValue)) {
      return NextResponse.json({ error: 'as_of는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
    }
    asOf = new Date(`${asOfValue}T00:00:00Z`);
  }

  try {
    const result = await runProjectionModel(getNBADataProvider(), {
      playerIds,
      horizon: rawHorizon as ProjectionHorizon,
      asOf,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    if (error instanceof NBAProviderError) {
      const status = error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'RATE_LIMITED' ? 429 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error(error);
    return NextResponse.json({ error: '예측 점수를 생성하지 못했습니다.' }, { status: 500 });
  }
}
