import { randomUUID } from 'crypto';
import { Card } from '../../../shared/src/types';

export class Player {
  public hand: Card[] = [];
  public isDisconnected: boolean = false;
  public isReady: boolean = false;
  public reconnectToken: string;
  public finalScore: number = 0;
  public stats = {
    cardsPlayed: 0,
    cardsDrawn: 0,
    penaltyCardsReceived: 0,
    normalDraws: 0,
    unoCalls: 0,
    successfulChallenges: 0,
    failedChallenges: 0,
  };

  public resetStats(): void {
    this.finalScore = 0;
    this.stats = {
      cardsPlayed: 0,
      cardsDrawn: 0,
      penaltyCardsReceived: 0,
      normalDraws: 0,
      unoCalls: 0,
      successfulChallenges: 0,
      failedChallenges: 0,
    };
  }

  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly avatarId: string,
    public readonly isBot: boolean = false,
    public readonly botDifficulty: 'EASY' | 'MEDIUM' | 'HARD' | null = null
  ) {
    this.reconnectToken = randomUUID();
  }

  /**
   * Adds a single card to the player's hand.
   */
  public addCard(card: Card): void {
    this.hand.push(card);
  }

  /**
   * Adds multiple cards to the player's hand.
   */
  public addCards(cards: Card[]): void {
    this.hand.push(...cards);
  }

  /**
   * Removes a card by ID from the player's hand and returns it.
   */
  public removeCard(cardId: string): Card | null {
    const idx = this.hand.findIndex((c) => c.id === cardId);
    if (idx === -1) return null;
    const [card] = this.hand.splice(idx, 1);
    return card;
  }

  /**
   * Checks if the player has any card matching a given color (excluding WILD cards).
   */
  public hasCardOfColor(color: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE'): boolean {
    return this.hand.some((c) => c.color === color);
  }
}
