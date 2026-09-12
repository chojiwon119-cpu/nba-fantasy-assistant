export interface ParsedInjuryStatus {
  status: string;
  availabilityProbability: number;
  note?: string;
}

// Bare single-letter Yahoo abbreviations (O/Q/D/P) are deliberately excluded: rawStatus is
// the full text of a roster row (up to 300 chars), not an isolated status field, so a lone
// letter token risks false-matching unrelated row content. Only unambiguous words are matched;
// anything else falls through to the conservative UNKNOWN default below.
const OUT_TOKENS = ['out', 'il', 'il+', 'ir'];
const DOUBTFUL_TOKENS = ['doubtful'];
const QUESTIONABLE_TOKENS = ['questionable', 'gtd', 'game time decision'];
const PROBABLE_TOKENS = ['probable'];
const ACTIVE_TOKENS = ['active', 'available'];

/**
 * Maps the status text the Yahoo Companion observes on a roster row to the same
 * availability-probability scale `injuryAvailability()` uses in projection-model.ts,
 * so the fail-closed conservative default (0.85) applies to anything we can't parse
 * rather than assuming a player is fully healthy.
 */
export function parseYahooInjuryStatus(rawStatus: string | undefined | null): ParsedInjuryStatus {
  const trimmed = (rawStatus ?? '').trim();
  if (!trimmed) {
    return { status: 'UNKNOWN', availabilityProbability: 0.85, note: 'unparsed status' };
  }

  const token = normalizeToken(trimmed);

  if (matchesAny(token, OUT_TOKENS)) return { status: 'OUT', availabilityProbability: 0.03 };
  if (matchesAny(token, DOUBTFUL_TOKENS)) return { status: 'DOUBTFUL', availabilityProbability: 0.25 };
  if (matchesAny(token, QUESTIONABLE_TOKENS)) return { status: 'QUESTIONABLE', availabilityProbability: 0.6 };
  if (matchesAny(token, PROBABLE_TOKENS)) return { status: 'PROBABLE', availabilityProbability: 0.9 };
  if (matchesAny(token, ACTIVE_TOKENS)) return { status: 'ACTIVE', availabilityProbability: 0.99 };

  return { status: 'UNKNOWN', availabilityProbability: 0.85, note: 'unparsed status' };
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[.\s]+/g, ' ').trim();
}

function matchesAny(token: string, candidates: string[]): boolean {
  return candidates.some((candidate) => token === candidate || new RegExp(`\\b${escapeRegExp(candidate)}\\b`).test(token));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
