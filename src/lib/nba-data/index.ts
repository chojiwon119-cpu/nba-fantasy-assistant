import { BallDontLieProvider } from './balldontlie';
import { APISportsNBAProvider } from './api-sports';
import { NBAOfficialProvider } from './nba-official';
import { NBADataProvider } from './types';

export function getNBADataProvider(): NBADataProvider {
  const provider = (process.env.NBA_DATA_PROVIDER ?? 'nba-official').toLowerCase();
  if (provider === 'nba-official') return new NBAOfficialProvider();
  if (provider === 'api-sports') return new APISportsNBAProvider();
  if (provider === 'balldontlie') return new BallDontLieProvider();
  throw new Error(`지원하지 않는 NBA 데이터 공급자입니다: ${provider}`);
}

export { BallDontLieProvider } from './balldontlie';
export { APISportsNBAProvider } from './api-sports';
export { NBAOfficialProvider } from './nba-official';
export * from './types';
