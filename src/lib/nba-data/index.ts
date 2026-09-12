import { BallDontLieProvider } from './balldontlie';
import { APISportsNBAProvider } from './api-sports';
import { ESPNPublicNBAProvider } from './espn-public';
import { NBADataProvider } from './types';

export function getNBADataProvider(): NBADataProvider {
  const provider = (process.env.NBA_DATA_PROVIDER ?? 'nba-official').toLowerCase();
  // NBA.com currently blocks Vercel egress. Existing production values migrate
  // to the keyless ESPN feed so the assistant stays operational without input.
  if (provider === 'espn-public' || provider === 'nba-official' || provider === 'api-sports') return new ESPNPublicNBAProvider();
  if (provider === 'api-sports-legacy') return new APISportsNBAProvider();
  if (provider === 'balldontlie') return new BallDontLieProvider();
  throw new Error(`지원하지 않는 NBA 데이터 공급자입니다: ${provider}`);
}

export { BallDontLieProvider } from './balldontlie';
export { APISportsNBAProvider } from './api-sports';
export { NBAOfficialProvider } from './nba-official';
export { ESPNPublicNBAProvider } from './espn-public';
export * from './types';
