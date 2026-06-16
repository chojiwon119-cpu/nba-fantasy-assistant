export interface YahooTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

export interface League {
  league_key: string;
  league_id: string;
  name: string;
  season: string;
  num_teams: number;
  current_week: number;
  scoring_type: string;
  my_team_key?: string;
  my_team_name?: string;
}

export interface PlayerStats {
  FGA: number; FGM: number;
  FTA: number; FTM: number;
  threePA: number; threePM: number;
  PTS: number; REB: number;
  AST: number; ST: number;
  BLK: number; TO: number;
  DD: number; TD: number;
  GP: number;
}

export interface Player {
  player_key: string;
  player_id: string;
  name: string;
  team: string;
  positions: string[];
  status: 'active' | 'injured' | 'out' | 'gtd' | 'suspended';
  injury_note?: string;
  headshot_url?: string;
  stats: PlayerStats;
  projected_stats?: PlayerStats;
  fantasy_score?: number;
  projected_fantasy_score?: number;
  adp?: number;
  ownership_pct?: number;
  ownership_change?: number;
}

export interface RosterPlayer extends Player {
  roster_position: string;
  is_starting: boolean;
}

export interface Team {
  team_key: string;
  team_id: string;
  name: string;
  manager: string;
  logo_url?: string;
  roster: RosterPlayer[];
  total_points?: number;
  rank?: number;
  is_my_team: boolean;
}

export interface DraftPick {
  round: number;
  pick: number;
  overall: number;
  team_key: string;
  player_key?: string;
  player?: Player;
}

export interface DraftState {
  current_round: number;
  current_pick: number;
  current_overall: number;
  my_pick_position: number;
  total_teams: number;
  drafted_players: string[];
  my_team: Player[];
  draft_board: DraftPick[];
  next_my_pick_overall: number;
  picks_until_mine: number;
}

export interface TradeAnalysis {
  giving: Player[];
  receiving: Player[];
  giving_score: number;
  receiving_score: number;
  score_diff: number;
  fairness_score: number;
  verdict: 'favorable' | 'unfavorable' | 'balanced';
  verdict_reason: string;
  position_impact: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  trend_analysis: {
    player_key: string;
    name: string;
    last_15_avg: number;
    season_avg: number;
    trend: 'up' | 'down' | 'stable';
  }[];
}

export type WaiverVerdict = 'pickup' | 'wait' | 'pass';

export interface WaiverComparison {
  pickup_player: Player;
  drop_player: Player;
  pickup_score: number;
  drop_score: number;
  score_diff: number;
  verdict: WaiverVerdict;
  verdict_reason: string;
  position_need: 'high' | 'medium' | 'low';
}

export const SCORING_WEIGHTS = {
  FGA: -1, FGM: 2, FTA: -1, FTM: 1.5,
  threePA: -1, threePM: 3, PTS: 1, REB: 1.2,
  AST: 1.8, ST: 3, BLK: 3, TO: -1, DD: 3, TD: 5,
} as const;

export const ROSTER_SLOTS = {
  PG: 1, SG: 1, G: 1, SF: 1, PF: 1, F: 1, C: 2, UTIL: 2,
  BN: 3, IL: 3, 'IL+': 1,
} as const;

export const DRAFT_ROSTER_SIZE = 13;

export const DEFAULT_SCORING = SCORING_WEIGHTS;
