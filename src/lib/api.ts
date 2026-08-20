import { NextResponse } from 'next/server';
import { fetchLeaguePlayers, fetchPlayersByKeys, getValidTokens } from '@/lib/yahoo';
import { Player } from '@/types';

export async function requireYahooTokens() {
  const tokens = await getValidTokens();
  if (!tokens) throw new Error('YAHOO_AUTH_REQUIRED');
  return tokens;
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Yahoo API 요청에 실패했습니다.';
  if (message === 'YAHOO_AUTH_REQUIRED') {
    return NextResponse.json({ error: 'Yahoo 로그인이 필요합니다.', code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Yahoo 데이터를 불러오지 못했습니다.', detail: message }, { status: 502 });
}

export async function resolvePlayers(leagueKey: string, identifiers: string[], tokens: Awaited<ReturnType<typeof getValidTokens>>) {
  if (!tokens) throw new Error('YAHOO_AUTH_REQUIRED');
  const keys = identifiers.filter(value => /^\d+\.p\.\d+$/.test(value));
  const names = identifiers.filter(value => !keys.includes(value));
  const byKey = await fetchPlayersByKeys(leagueKey, keys, tokens);
  if (!names.length) return byKey;
  const all = await fetchLeaguePlayers(leagueKey, tokens, 200);
  const normalized = names.map(name => name.toLowerCase());
  return [...byKey, ...all.filter(player => normalized.includes(player.name.toLowerCase()))];
}

export function playerMap(players: Player[]) {
  return new Map(players.map(player => [player.player_key, player]));
}
