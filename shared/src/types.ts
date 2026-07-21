// ─── Game Variant ───────────────────────────────────────────────
export type GameVariant = 'CLASSIC' | 'FLIP' | 'MERCY';

// ─── Card Types ─────────────────────────────────────────────────
export type CardColor =
  | 'RED' | 'YELLOW' | 'GREEN' | 'BLUE'
  // Flip dark-side colors
  | 'PINK' | 'TEAL' | 'ORANGE' | 'PURPLE'
  | 'WILD';

export type CardValue =
  // Number cards (all variants)
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  // Classic action cards
  | 'SKIP' | 'REVERSE' | 'DRAW_TWO'
  | 'WILD' | 'WILD_DRAW_FOUR'
  // Flip light-side
  | 'DRAW_ONE' | 'FLIP' | 'WILD_DRAW_TWO'
  // Flip dark-side
  | 'DRAW_FIVE' | 'SKIP_EVERYONE' | 'WILD_DRAW_COLOR'
  // Mercy
  | 'DRAW_FOUR' | 'DISCARD_ALL'
  | 'WILD_DRAW_SIX' | 'WILD_DRAW_TEN'
  | 'WILD_REVERSE_DRAW_FOUR' | 'WILD_COLOR_ROULETTE';

export interface Card {
  readonly id: string;
  readonly color: CardColor;
  readonly value: CardValue;
  /** Flip variant: the opposite face of this card */
  readonly darkFace?: { color: CardColor; value: CardValue };
}

// ─── Room Settings ──────────────────────────────────────────────
export interface RoomSettings {
  maxPlayers: number;
  isPublic: boolean;
  turnTimerLimit: number;
  allowSpectators: boolean;
  enableBots: boolean;
  botDifficulty: 'EASY' | 'MEDIUM' | 'HARD';
  spectatorDelaySec: number;
  unoTimeoutSec: number;
  gameVariant: GameVariant;
  houseRules: {
    stackDrawTwo: boolean;
    stackDrawFour: boolean;
    sevenZeroRule: boolean;
    jumpIn: boolean;
    forcePlay: boolean;
    progressiveDraw: boolean;
  };
}

// ─── Chat ───────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
}

// ─── Match Statistics ───────────────────────────────────────────
export interface MatchStatistic {
  playerId: string;
  username: string;
  rank: number;
  cardsPlayed: number;
  cardsDrawn: number;
  score: number;
}

// ─── Game Status ────────────────────────────────────────────────
export type GameStatus = 'LOBBY' | 'PLAYING' | 'CHALLENGE_WINDOW' | 'SCORING' | 'GAME_OVER';

// ─── Player Game State (sent to each player) ────────────────────
export interface PlayerGameState {
  gameVariant: GameVariant;
  players: {
    id: string;
    username: string;
    avatarId: string;
    handSize: number;
    isBot: boolean;
    isDisconnected: boolean;
  }[];
  myHand: Card[];
  topDiscardCard: Card;
  currentColor: CardColor;
  direction: 1 | -1;
  currentPlayerIndex: number;
  winnerId: string | null;
  stateVersion: number;
  drawPileSize: number;
  pendingChallenge: boolean;
  waitingForStartingColor: boolean;
  gameStatus: GameStatus;
  challengeTarget: string | null;
  remainingTime: number;
  movesHistory: any[];
  matchDuration: string | null;
  totalMoves: number;
  mostUsedColor: CardColor | null;
  matchStatistics: MatchStatistic[] | null;
  hostId: string;
  spectatorCount: number;
  // Flip-specific
  activeSide?: 'LIGHT' | 'DARK';
  // Mercy-specific
  eliminatedPlayers?: string[];
  stackedDrawTotal?: number;
  pendingSwapTarget?: boolean;
  pendingRouletteColor?: boolean;
}

// ─── Spectator Game State (no hand info) ────────────────────────
export interface SpectatorGameState {
  gameVariant: GameVariant;
  players: {
    id: string;
    username: string;
    avatarId: string;
    handSize: number;
    isBot: boolean;
    isDisconnected: boolean;
  }[];
  topDiscardCard: Card;
  currentColor: CardColor;
  direction: 1 | -1;
  currentPlayerIndex: number;
  winnerId: string | null;
  stateVersion: number;
  drawPileSize: number;
  gameStatus: GameStatus;
  challengeTarget: string | null;
  remainingTime: number;
  movesHistory: any[];
  matchDuration: string | null;
  totalMoves: number;
  mostUsedColor: CardColor | null;
  matchStatistics: MatchStatistic[] | null;
  hostId: string;
  spectatorCount: number;
  // Flip-specific
  activeSide?: 'LIGHT' | 'DARK';
  // Mercy-specific
  eliminatedPlayers?: string[];
  stackedDrawTotal?: number;
}
