import { NextRequest, NextResponse } from 'next/server';
import { BallDontLieProvider, NBAProviderError } from '@/lib/nba-data';

export async function GET(request: NextRequest) {
  const provider = new BallDontLieProvider();
  const probe = request.nextUrl.searchParams.get('probe') === '1';

  if (!provider.configured) {
    return NextResponse.json({
      provider: provider.displayName,
      configured: false,
      connected: false,
      modelVersion: 'nba-fpts-v1.0.0',
      requiredTier: 'ALL-STAR 이상',
      features: { players: true, schedule: true, gameStats: false, injuries: false },
      message: 'BALLDONTLIE_API_KEY를 설정하면 자동 수집이 시작됩니다.',
    });
  }

  if (!probe) {
    return NextResponse.json({
      provider: provider.displayName,
      configured: true,
      connected: null,
      modelVersion: 'nba-fpts-v1.0.0',
      requiredTier: 'ALL-STAR 이상',
      message: 'API 키가 설정되어 있습니다. probe=1로 실제 연결을 확인할 수 있습니다.',
    });
  }

  try {
    await provider.probe();
    return NextResponse.json({
      provider: provider.displayName,
      configured: true,
      connected: true,
      modelVersion: 'nba-fpts-v1.0.0',
      requiredTier: 'ALL-STAR 이상',
      message: 'NBA 데이터 공급자 연결이 정상입니다.',
    });
  } catch (error) {
    const detail = error instanceof NBAProviderError ? error.code : 'UPSTREAM_ERROR';
    return NextResponse.json({
      provider: provider.displayName,
      configured: true,
      connected: false,
      modelVersion: 'nba-fpts-v1.0.0',
      requiredTier: 'ALL-STAR 이상',
      message: 'NBA 데이터 공급자 연결을 확인하지 못했습니다.',
      code: detail,
    }, { status: 502 });
  }
}
