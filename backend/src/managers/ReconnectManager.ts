import { Room } from '../core/Room';

export class ReconnectManager {
  private static disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Starts a 120-second reconnection window for a player.
   * If the player does not reconnect in time, the expiration callback executes.
   */
  public static startTimer(
    playerId: string,
    onExpired: () => void
  ): void {
    // Clear any previous timer if somehow present
    this.cancelTimer(playerId);

    const timeout = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      onExpired();
    }, 120000); // 120 seconds

    this.disconnectTimers.set(playerId, timeout);
  }

  /**
   * Cancels a pending disconnect timer (successful reconnection).
   */
  public static cancelTimer(playerId: string): boolean {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
      return true;
    }
    return false;
  }

  /**
   * Checks if a player is currently in a disconnected/wait status.
   */
  public static isDisconnected(playerId: string): boolean {
    return this.disconnectTimers.has(playerId);
  }

  /**
   * Clears all timers (e.g. during server shutdown or room deletion).
   */
  public static clearAll(): void {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }
}
