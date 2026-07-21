import { Card, CardColor, CardValue, GameStatus, RoomSettings, MatchStatistic } from '../../../shared/src/types';
import { Player } from './Player';
import { TurnManager } from './TurnManager';
import { ChallengeManager } from './ChallengeManager';

export interface MoveEntry {
  turnIndex: number;
  playerId: string;
  playerName: string;
  action: 'PLAY' | 'DRAW' | 'PASS' | 'UNO' | 'CHALLENGE' | 'CHALLENGE_RESOLVED';
  card: string | null;
  color: string | null;
  timestamp: Date;
  stateVersion: number;
}

/**
 * Abstract interface that all game variant engines must implement.
 * The shared infrastructure (GameManager, Room, socketHandler) interacts
 * exclusively through this contract — never through concrete engine classes.
 */
export interface IGameEngine {
  // ─── Player roster ────────────────────────────────────────────
  players: Player[];

  // ─── Deck state ───────────────────────────────────────────────
  deck: Card[];
  discardPile: Card[];

  // ─── Turn / direction ─────────────────────────────────────────
  turnManager: TurnManager;
  currentColor: CardColor;

  // ─── Challenge ────────────────────────────────────────────────
  challengeManager: ChallengeManager;
  previousColorBeforeWD4: CardColor | null;

  // ─── Game lifecycle ───────────────────────────────────────────
  gameStatus: GameStatus;
  winnerId: string | null;
  stateVersion: number;

  // ─── Draw state ───────────────────────────────────────────────
  hasDrawnThisTurn: boolean;
  drawnCardThisTurn: Card | null;

  // ─── UNO call tracking ────────────────────────────────────────
  unoCalledBy: Set<string>;
  unoVulnerablePlayerId: string | null;

  // ─── Match metadata ───────────────────────────────────────────
  waitingForStartingColor: boolean;
  matchStartTimestamp: number;
  matchDurationStr: string | null;
  totalMoves: number;
  movesHistory: MoveEntry[];

  // ─── Settings ─────────────────────────────────────────────────
  readonly roomSettings: RoomSettings;

  // ─── Core game actions ────────────────────────────────────────
  startGame(dealerId: string): void;
  playCard(playerId: string, cardId: string, chosenColor?: CardColor): void;
  drawCard(playerId: string): void;
  passTurn(playerId: string): void;
  callUno(playerId: string): void;
  catchUno(catcherId: string, targetId: string): void;
  executeChallenge(challengerId: string, shouldChallenge: boolean): void;
  handleTimeout(): void;
  endGame(winnerId: string): void;
  selectStartingColor(playerId: string, color: CardColor): void;

  // ─── Queries ──────────────────────────────────────────────────
  getCurrentPlayer(): Player;
  getMostUsedColor(): CardColor | null;
  getMatchStatistics(): MatchStatistic[] | null;
  drawCardsForPlayer(player: Player, count: number): Card[];

  // ─── Lifecycle helpers ────────────────────────────────────────
  verifyCardConservation(): void;
  incrementStateVersion(): void;
}
