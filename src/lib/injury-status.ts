import { Player } from '@/types';

export interface ParsedInjuryStatus {
  status: string;
  availabilityProbability: number;
}

// Yahoo's own `status` field is already a normalized enum (active/injured/out/gtd/suspended —
// see parseStats() call sites in yahoo.ts), so this maps that enum directly instead of the old
// free-text scraping the Chrome companion used to need. `injury_note` (e.g. "Questionable",
// "Doubtful") refines the ambiguous 'injured' bucket when Yahoo provides it.
const STATUS_PROBABILITY: Record<Player['status'], number> = {
  active: 0.99,
  gtd: 0.6,
  injured: 0.4,
  suspended: 0.03,
  out: 0.03,
};

const NOTE_PROBABILITY: Array<{ pattern: RegExp; probability: number }> = [
  { pattern: /doubtful/i, probability: 0.25 },
  { pattern: /questionable|game.time.decision/i, probability: 0.6 },
  { pattern: /probable/i, probability: 0.9 },
  { pattern: /out|injured.reserve|\bil\b/i, probability: 0.03 },
];

export function parseInjuryStatus(status: Player['status'], injuryNote?: string): ParsedInjuryStatus {
  const note = injuryNote?.trim();
  if (status === 'injured' && note) {
    const matched = NOTE_PROBABILITY.find((entry) => entry.pattern.test(note));
    if (matched) return { status: note, availabilityProbability: matched.probability };
  }
  return {
    status: note || status.toUpperCase(),
    availabilityProbability: STATUS_PROBABILITY[status] ?? 0.85,
  };
}
