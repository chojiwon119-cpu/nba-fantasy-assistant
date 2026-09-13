import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens } from '@/lib/api';
import { runProjectionModel, ProjectionPlayerInput } from '@/lib/projection-model';
import { ProjectionHorizon } from '@/types/projections';

const HORIZONS = new Set<ProjectionHorizon>([
  'next_game', 'next_7_days', 'next_14_days', 'rest_of_season', 'fantasy_playoffs',
]);

interface RequestBody {
  players?: ProjectionPlayerInput[];
  horizon?: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const players = Array.isArray(body.players) ? body.players.filter((player) => player?.player_key && player?.name) : [];
  if (players.length === 0) {
    return NextResponse.json({ error: 'player_key와 name이 있는 선수 목록이 필요합니다.' }, { status: 400 });
  }
  if (players.length > 25) {
    return NextResponse.json({ error: '한 번에 최대 25명까지 예측할 수 있습니다.' }, { status: 400 });
  }
  const horizon = (body.horizon ?? 'next_7_days') as ProjectionHorizon;
  if (!HORIZONS.has(horizon)) {
    return NextResponse.json({ error: '지원하지 않는 horizon입니다.' }, { status: 400 });
  }

  try {
    const tokens = await requireYahooTokens();
    const result = await runProjectionModel(tokens, { players, horizon });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    return apiError(error);
  }
}
