import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens } from '@/lib/api';
import { fetchLeaguePlayers } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  try {
    const leagueKey = request.nextUrl.searchParams.get('league_key');
    if (!leagueKey) return NextResponse.json({ error: 'league_key가 필요합니다.' }, { status: 400 });
    const count = Math.min(100, Number(request.nextUrl.searchParams.get('count') ?? 100) || 100);
    const tokens = await requireYahooTokens();
    return NextResponse.json({ players: await fetchLeaguePlayers(leagueKey, tokens, count) });
  } catch (error) {
    return apiError(error);
  }
}
