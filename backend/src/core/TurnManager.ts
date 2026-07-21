export class TurnManager {
  public currentPlayerIndex: number = 0;
  public direction: 1 | -1 = 1; // 1 = Clockwise, -1 = Counter-Clockwise

  constructor(private totalPlayers: number) {}

  /**
   * Updates the total player count for wrap-around calculation.
   */
  public setTotalPlayers(count: number): void {
    this.totalPlayers = count;
  }

  /**
   * Returns the current total players (needed by Mercy for eliminations).
   */
  public getTotalPlayers(): number {
    return this.totalPlayers;
  }

  /**
   * Advances the turn index by a specified skip count.
   * If skipCount is 1, it moves to the immediate next player.
   * If skipCount is 2 (e.g. Skip card), it skips the next player.
   */
  public next(skipCount: number = 1): number {
    if (this.totalPlayers <= 0) return 0;
    
    const shift = (skipCount * this.direction) % this.totalPlayers;
    this.currentPlayerIndex = (this.currentPlayerIndex + shift + this.totalPlayers) % this.totalPlayers;
    return this.currentPlayerIndex;
  }

  /**
   * Reverses the direction of play.
   * If the game has exactly 2 players, Reverse behaves as a Skip card instead.
   */
  public reverse(): void {
    if (this.totalPlayers === 2) {
      // In 2-player, Reverse acts like Skip.
      // Since it acts like Skip, the current player takes another turn,
      // which is equivalent to moving 2 steps (normal step + skip step).
      // We will handle the skip logic inside the game orchestrator,
      // but TurnManager direction stays the same.
    } else {
      this.direction = (this.direction === 1 ? -1 : 1);
    }
  }

  /**
   * Evaluates who the next player index would be without mutating the state.
   */
  public peekNext(skipCount: number = 1): number {
    if (this.totalPlayers <= 0) return 0;
    const shift = (skipCount * this.direction) % this.totalPlayers;
    return (this.currentPlayerIndex + shift + this.totalPlayers) % this.totalPlayers;
  }
}
