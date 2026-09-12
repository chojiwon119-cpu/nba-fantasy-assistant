import { BallDontLieProvider } from './balldontlie';
import { NBADataProvider } from './types';

export function getNBADataProvider(): NBADataProvider {
  const provider = (process.env.NBA_DATA_PROVIDER ?? 'balldontlie').toLowerCase();
  if (provider === 'balldontlie') return new BallDontLieProvider();
  throw new Error(`지원하지 않는 NBA 데이터 공급자입니다: ${provider}`);
}

export { BallDontLieProvider } from './balldontlie';
export * from './types';
