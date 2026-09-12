import { NBADataProvider, NBAPlayerIdentity } from './types';
import { normalizePlayerName, normalizeTeamAbbreviation } from './name-utils';

export interface YahooPlayerMatchInput {
  yahooPlayerId: string;
  name: string;
  nbaTeam?: string;
  eligiblePositions?: string[];
}

export interface YahooPlayerMatchResult {
  yahooPlayerId: string;
  yahooName: string;
  status: 'matched' | 'ambiguous' | 'unmatched';
  confidence: number;
  reason: string;
  nbaPlayer?: NBAPlayerIdentity;
}

export async function matchYahooPlayers(
  provider: NBADataProvider,
  inputs: YahooPlayerMatchInput[],
): Promise<YahooPlayerMatchResult[]> {
  return Promise.all(inputs.map(async (input) => matchOne(input, await provider.searchPlayers(input.name))));
}

export function matchOne(input: YahooPlayerMatchInput, candidates: NBAPlayerIdentity[]): YahooPlayerMatchResult {
  const name = normalizePlayerName(input.name);
  const team = normalizeTeamAbbreviation(input.nbaTeam);
  const exact = candidates.filter((candidate) => normalizePlayerName(candidate.name) === name);
  const sameTeam = exact.filter((candidate) => normalizeTeamAbbreviation(candidate.teamAbbreviation) === team);
  const selected = sameTeam.length === 1 ? sameTeam[0] : exact.length === 1 ? exact[0] : undefined;

  if (selected) {
    const teamConfirmed = Boolean(team && normalizeTeamAbbreviation(selected.teamAbbreviation) === team);
    return {
      yahooPlayerId: input.yahooPlayerId,
      yahooName: input.name,
      status: 'matched',
      confidence: teamConfirmed ? 1 : 0.96,
      reason: teamConfirmed ? '정규화된 이름과 NBA 팀이 모두 일치합니다.' : '정규화된 전체 이름이 정확히 일치합니다.',
      nbaPlayer: {
        ...selected,
        positions: input.eligiblePositions?.length ? input.eligiblePositions : selected.positions,
      },
    };
  }
  return {
    yahooPlayerId: input.yahooPlayerId,
    yahooName: input.name,
    status: exact.length > 1 ? 'ambiguous' : 'unmatched',
    confidence: 0,
    reason: exact.length > 1 ? '같은 이름의 NBA 선수가 여러 명이라 팀 확인이 필요합니다.' : 'NBA 공식 선수 명단에서 정확한 이름을 찾지 못했습니다.',
  };
}
