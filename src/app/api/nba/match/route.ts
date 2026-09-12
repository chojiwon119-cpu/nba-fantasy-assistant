import { NextRequest, NextResponse } from 'next/server';
import { getNBADataProvider, NBAProviderError } from '@/lib/nba-data';
import { matchYahooPlayers, YahooPlayerMatchInput } from '@/lib/nba-data/player-matcher';

export async function POST(request: NextRequest) {
  let body: { players?: YahooPlayerMatchInput[] };
  try {
    body = await request.json() as { players?: YahooPlayerMatchInput[] };
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }
  const players = Array.isArray(body.players) ? body.players.slice(0, 250) : [];
  if (players.length === 0 || players.some((player) => !player.yahooPlayerId || !player.name)) {
    return NextResponse.json({ error: 'yahooPlayerId와 name이 있는 선수 목록이 필요합니다.' }, { status: 400 });
  }
  try {
    const provider = getNBADataProvider();
    const matches = await matchYahooPlayers(provider, players);
    return NextResponse.json({
      provider: provider.displayName,
      matchedAt: new Date().toISOString(),
      summary: {
        total: matches.length,
        matched: matches.filter((match) => match.status === 'matched').length,
        ambiguous: matches.filter((match) => match.status === 'ambiguous').length,
        unmatched: matches.filter((match) => match.status === 'unmatched').length,
      },
      matches,
    });
  } catch (error) {
    if (error instanceof NBAProviderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'RATE_LIMITED' ? 429 : 502 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Yahoo 선수와 NBA 선수를 연결하지 못했습니다.' }, { status: 500 });
  }
}
