import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens } from '@/lib/api';
import { fetchMyTeam } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  try {
    const leagueKey = request.nextUrl.searchParams.get('league_key');
    if (!leagueKey) return NextResponse.json({ error: 'league_key가 필요합니다.' }, { status: 400 });
    const tokens = await requireYahooTokens();
    return NextResponse.json({ team: await fetchMyTeam(leagueKey, tokens) });
  } catch (error) {
    return apiError(error);
  }
}
