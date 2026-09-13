import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens, resolvePlayers } from '@/lib/api';
import { fetchFreeAgents } from '@/lib/yahoo';
import { runProjectionModel } from '@/lib/projection-model';
import { Player } from '@/types';

async function projectedScoreFor(player: Player, tokens: Awaited<ReturnType<typeof requireYahooTokens>>): Promise<number> {
  const result = await runProjectionModel(tokens, {
    players: [{ player_key: player.player_key, name: player.name, team: player.team, status: player.status, injury_note: player.injury_note }],
    horizon: 'next_14_days',
  });
  return result.projections[0]?.pointsPerActiveGame ?? player.fantasy_score ?? 0;
}

export async function GET(request: NextRequest) {
  try {
    const leagueKey = request.nextUrl.searchParams.get('league_key');
    if (!leagueKey) return NextResponse.json({ error: 'league_key가 필요합니다.' }, { status: 400 });
    const tokens = await requireYahooTokens();
    return NextResponse.json({ free_agents: await fetchFreeAgents(leagueKey, tokens, 100) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const leagueKey = String(body.league_key || '');
    const tokens = await requireYahooTokens();
    const [pickup] = await resolvePlayers(leagueKey, [String(body.pickup_key || '')], tokens);
    const [drop] = await resolvePlayers(leagueKey, [String(body.drop_key || '')], tokens);
    if (!pickup || !drop) return NextResponse.json({ error: '픽업 또는 컷 선수를 찾지 못했습니다.' }, { status: 404 });
    const [pickupScore, dropScore] = await Promise.all([
      projectedScoreFor(pickup, tokens),
      projectedScoreFor(drop, tokens),
    ]);
    const scoreDiff = pickupScore - dropScore;
    const verdict = scoreDiff >= 5 ? 'pickup' : scoreDiff <= -5 ? 'pass' : 'wait';
    return NextResponse.json({
      pickup_player: pickup, drop_player: drop, pickup_score: pickupScore, drop_score: dropScore, score_diff: scoreDiff, verdict,
      verdict_reason: verdict === 'pickup' ? '픽업 선수의 향후 14일 예측 점수가 더 높습니다.' : verdict === 'pass' ? '현재 로스터를 유지하는 편이 낫습니다.' : '두 선수의 차이가 작아 추가 비교가 필요합니다.',
      model: 'next_14_days projection (Yahoo date-stats 기반)',
    });
  } catch (error) {
    return apiError(error);
  }
}
