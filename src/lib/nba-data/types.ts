import { PlayerStats } from '@/types';

export interface NBAPlayerIdentity {
  id: string;
  name: string;
  teamId: string;
  teamAbbreviation: string;
  positions: string[];
}

export interface NBAGame {
  id: string;
  date: string;
  datetime: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled' | 'unknown';
  homeTeamId: string;
  visitorTeamId: string;
  homeTeamScore: number;
  visitorTeamScore: number;
}

export interface NBAPlayerGameStat {
  playerId: string;
  teamId: string;
  gameId: string;
  date: string;
  minutes: number;
  stats: Omit<PlayerStats, 'GP'>;
}

export interface NBAInjury {
  playerId: string;
  status: string;
  description: string;
  returnDate?: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface NBADataProvider {
  readonly id: string;
  readonly displayName: string;
  searchPlayers(query: string): Promise<NBAPlayerIdentity[]>;
  getPlayersByIds(playerIds: string[]): Promise<NBAPlayerIdentity[]>;
  getGames(range: DateRange): Promise<NBAGame[]>;
  getPlayerGameStats(playerIds: string[], range: DateRange): Promise<NBAPlayerGameStat[]>;
  getPlayerInjuries(playerIds: string[]): Promise<NBAInjury[]>;
}

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE';

export class NBAProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'NBAProviderError';
  }
}
