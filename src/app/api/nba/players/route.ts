import { NextRequest, NextResponse } from 'next/server';
import { getNBADataProvider, NBAProviderError } from '@/lib/nba-data';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search')?.trim();
  if (!search || search.length < 2) {
    return NextResponse.json({ error: 'search는 두 글자 이상이어야 합니다.' }, { status: 400 });
  }

  try {
    const provider = getNBADataProvider();
    return NextResponse.json({ provider: provider.displayName, players: await provider.searchPlayers(search) });
  } catch (error) {
    return providerError(error);
  }
}

function providerError(error: unknown) {
  if (error instanceof NBAProviderError) {
    const status = error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'RATE_LIMITED' ? 429 : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error(error);
  return NextResponse.json({ error: '선수 검색 중 오류가 발생했습니다.' }, { status: 500 });
}
