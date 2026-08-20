import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireYahooTokens } from '@/lib/api';
import { fetchLeaguePlayers, getNextMyPick } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const leagueKey = params.get('league_key');
    if (!leagueKey) return NextResponse.json({ error: 'league_key가 필요합니다.' }, { status: 400 });
    const myPosition = Number(params.get('my_position') || 1);
    const currentOverall = Number(params.get('current_overall') || 0);
    const totalTeams = Number(params.get('total_teams') || 6);
    const drafted = new Set((params.get('drafted') || '').split(',').filter(Boolean));
    const tokens = await requireYahooTokens();
    const players = (await fetchLeaguePlayers(leagueKey, tokens, 200)).filter(player => !drafted.has(player.player_key));
    const { nextPick, picksUntil } = getNextMyPick(myPosition, totalTeams, currentOverall, 13);
    return NextResponse.json({ players, nextPick, picksUntil });
  } catch (error) {
    return apiError(error);
  }
}
