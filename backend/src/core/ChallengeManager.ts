import { Card, CardColor } from '../../../shared/src/types';

export interface ChallengeResult {
  success: boolean; // True if the challenge succeeded (the challenged player bluffed/had matching color)
  guiltyPlayerId: string;
  innocentPlayerId: string;
  drawCount: number; // 4 if challenge succeeded, 6 if challenge failed
  drawTargetId: string;
  skipTargetId: string; // The player whose turn is skipped (the challenger, if challenge failed; otherwise no turn is skipped)
}

export class ChallengeManager {
  public active: boolean = false;
  public challengerId: string = '';
  public challengedId: string = '';
  public previousColor: CardColor | null = null;
  public wildDraw4Card: Card | null = null;
  public chosenColor: CardColor | null = null;

  /**
   * Initializes a new challenge window.
   */
  public trigger(
    challengerId: string,
    challengedId: string,
    previousColor: CardColor,
    wildDraw4Card: Card,
    chosenColor: CardColor
  ): void {
    this.active = true;
    this.challengerId = challengerId;
    this.challengedId = challengedId;
    this.previousColor = previousColor;
    this.wildDraw4Card = wildDraw4Card;
    this.chosenColor = chosenColor;
  }

  /**
   * Resolves the challenge based on the challenged player's hand.
   * If the challenged player has a card matching the previous color, the challenge succeeds.
   */
  public resolve(challengedHand: Card[]): ChallengeResult {
    if (!this.active || !this.previousColor) {
      throw new Error('No active challenge to resolve');
    }

    const matchesColor = challengedHand.some((card) => card.color === this.previousColor);

    this.active = false;

    if (matchesColor) {
      // Challenge succeeds (challenged player is guilty)
      return {
        success: true,
        guiltyPlayerId: this.challengedId,
        innocentPlayerId: this.challengerId,
        drawCount: 4,
        drawTargetId: this.challengedId,
        skipTargetId: '', // No skip on challenger's turn, challenger plays normally. The challenged player draws 4.
      };
    } else {
      // Challenge fails (challenged player is innocent)
      return {
        success: false,
        guiltyPlayerId: this.challengerId,
        innocentPlayerId: this.challengedId,
        drawCount: 6, // 4 from WD4 + 2 penalty
        drawTargetId: this.challengerId,
        skipTargetId: this.challengerId, // Challenger is skipped
      };
    }
  }

  /**
   * Resets the challenge state.
   */
  public clear(): void {
    this.active = false;
    this.challengerId = '';
    this.challengedId = '';
    this.previousColor = null;
    this.wildDraw4Card = null;
    this.chosenColor = null;
  }
}
