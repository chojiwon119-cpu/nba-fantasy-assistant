import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens, resolvePlayers } from '@/lib/api';
import { Player } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const leagueKey = String(body.league_key || '');
    const givingKeys = Array.isArray(body.giving_keys) ? body.giving_keys : [];
    const receivingKeys = Array.isArray(body.receiving_keys) ? body.receiving_keys : [];
    if (!leagueKey || !givingKeys.length || !receivingKeys.length) return NextResponse.json({ error: '리그와 양쪽 선수 정보가 필요합니다.' }, { status: 400 });
    const tokens = await requireYahooTokens();
    const [giving, receiving] = await Promise.all([
      resolvePlayers(leagueKey, givingKeys, tokens),
      resolvePlayers(leagueKey, receivingKeys, tokens),
    ]);
    if (giving.length !== givingKeys.length || receiving.length !== receivingKeys.length) return NextResponse.json({ error: '일부 선수를 Yahoo에서 찾지 못했습니다. player_key를 확인하세요.' }, { status: 404 });
    const score = (players: Player[]) => players.reduce((sum, player) => sum + (player.fantasy_score || 0), 0);
    const givingScore = score(giving);
    const receivingScore = score(receiving);
    const scoreDiff = receivingScore - givingScore;
    const fairnessScore = Math.max(0, Math.min(100, Math.round(50 + scoreDiff / Math.max(1, givingScore + receivingScore) * 100)));
    const verdict = fairnessScore >= 55 ? 'favorable' : fairnessScore <= 45 ? 'unfavorable' : 'balanced';
    return NextResponse.json({ giving, receiving, giving_score: givingScore, receiving_score: receivingScore, score_diff: scoreDiff, fairness_score: fairnessScore, verdict, verdict_reason: verdict === 'favorable' ? '받는 선수 쪽의 Fantasy Score가 더 높습니다.' : verdict === 'unfavorable' ? '주는 선수 쪽의 Fantasy Score가 더 높습니다.' : '양쪽의 Fantasy Score 차이가 크지 않습니다.' });
  } catch (error) {
    return apiError(error);
  }
}
