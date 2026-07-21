import { Card, CardColor } from '../../../shared/src/types';
import { Player } from './Player';

/**
 * Decision output from a bot AI strategy.
 */
export interface BotDecision {
  action: 'PLAY' | 'DRAW' | 'PASS' | 'CHALLENGE' | 'ACCEPT';
  cardId?: string;
  chosenColor?: CardColor;
  callUno?: boolean;
  /** Mercy: target player ID for 7s hand-swap */
  swapTargetId?: string;
}

/**
 * Abstract bot strategy interface.
 * Each game variant provides its own implementation.
 */
export interface IBotStrategy {
  /**
   * Evaluates and returns the bot's move during its active turn.
   */
  makeTurnDecision(
    bot: Player,
    topDiscard: Card,
    activeColor: CardColor,
    opponents: { id: string; handSize: number }[],
    hasDrawnThisTurn: boolean,
    drawnCard?: Card | null,
    stackedDrawTotal?: number
  ): BotDecision;

  /**
   * Decides whether to challenge a Wild Draw 4 (or similar) played by the previous player.
   */
  makeChallengeDecision(
    bot: Player,
    challengedPlayerHandSize: number
  ): boolean;

  /** Mercy-specific: selects target player to swap hands with */
  selectSwapTarget?(bot: Player, opponents: { id: string; handSize: number }[]): string;

  /** Mercy-specific: selects color for Color Roulette */
  selectRouletteColor?(bot: Player): CardColor;
}

