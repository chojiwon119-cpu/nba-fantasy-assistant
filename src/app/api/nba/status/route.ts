import { NextRequest, NextResponse } from 'next/server';
import { getNBADataProvider, NBAProviderError } from '@/lib/nba-data';

export async function GET(request: NextRequest) {
  const provider = getNBADataProvider();
  const probe = request.nextUrl.searchParams.get('probe') === '1';
  const isKeylessProvider = provider.id === 'nba-official';
  const isFreeProvider = isKeylessProvider || provider.id === 'api-sports';
  const common = {
    provider: provider.displayName,
    modelVersion: 'nba-fpts-v1.0.0',
    requiredTier: isKeylessProvider ? '무료 · API 키 없음' : isFreeProvider ? 'Free' : 'ALL-STAR 이상',
    injurySource: isFreeProvider ? 'Yahoo Companion' : provider.displayName,
    usage: provider.getUsage(),
  };

  if (!provider.configured) {
    return NextResponse.json({
      ...common,
      configured: false,
      connected: false,
      features: { players: true, schedule: true, gameStats: true, injuries: false },
      message: provider.id === 'api-sports'
        ? '무료 API_SPORTS_KEY를 설정하면 자동 수집이 시작됩니다.'
        : 'BALLDONTLIE_API_KEY를 설정하면 자동 수집이 시작됩니다.',
    });
  }

  if (!probe) {
    return NextResponse.json({
      ...common,
      configured: true,
      connected: null,
      message: isKeylessProvider ? 'NBA 공식 데이터 공급자가 준비되어 있습니다.' : 'API 키가 설정되어 있습니다. probe=1로 실제 연결을 확인할 수 있습니다.',
    });
  }

  try {
    await provider.probe();
    return NextResponse.json({
      ...common,
      usage: provider.getUsage(),
      configured: true,
      connected: true,
      message: 'NBA 데이터 공급자 연결이 정상입니다.',
    });
  } catch (error) {
    const detail = error instanceof NBAProviderError ? error.code : 'UPSTREAM_ERROR';
    return NextResponse.json({
      ...common,
      usage: provider.getUsage(),
      configured: true,
      connected: false,
      message: 'NBA 데이터 공급자 연결을 확인하지 못했습니다.',
      code: detail,
    }, { status: 502 });
  }
}
