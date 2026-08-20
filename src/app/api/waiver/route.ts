import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens, resolvePlayers } from '@/lib/api';
import { fetchFreeAgents } from '@/lib/yahoo';

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
    const pickupScore = pickup.fantasy_score || 0;
    const dropScore = drop.fantasy_score || 0;
    const scoreDiff = pickupScore - dropScore;
    const verdict = scoreDiff >= 5 ? 'pickup' : scoreDiff <= -5 ? 'pass' : 'wait';
    return NextResponse.json({ pickup_player: pickup, drop_player: drop, pickup_score: pickupScore, drop_score: dropScore, score_diff: scoreDiff, verdict, verdict_reason: verdict === 'pickup' ? '픽업 선수의 Fantasy Score가 더 높습니다.' : verdict === 'pass' ? '현재 로스터를 유지하는 편이 낫습니다.' : '두 선수의 차이가 작아 추가 비교가 필요합니다.' });
  } catch (error) {
    return apiError(error);
  }
}
