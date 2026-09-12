const TEAM_ALIASES: Record<string, string> = {
  GS: 'GSW', GSW: 'GSW',
  NO: 'NOP', NOR: 'NOP', NOP: 'NOP',
  NY: 'NYK', NYK: 'NYK',
  PHO: 'PHX', PHX: 'PHX',
  SA: 'SAS', SAS: 'SAS',
  BRK: 'BKN', BKN: 'BKN',
};

export function normalizePlayerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeTeamAbbreviation(value?: string): string {
  const normalized = (value ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return TEAM_ALIASES[normalized] ?? normalized;
}
