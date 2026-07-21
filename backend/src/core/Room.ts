import { Player } from './Player';
import { IGameEngine } from './IGameEngine';
import { RoomSettings, ChatMessage } from '../../../shared/src/types';


export class Room {
  public players: Player[] = [];
  public spectators: { id: string; username: string }[] = [];
  public banList: Set<string> = new Set();
  public engine: IGameEngine;
  public chatHistory: ChatMessage[] = [];
  
  // Rate-limiting and spam filtering
  private lastChatTimestamps: Map<string, number> = new Map();
  private lastChatContents: Map<string, string> = new Map();
  
  // Bot action schedule timer handles
  public botActionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    public readonly roomCode: string,
    public hostId: string,
    public settings: RoomSettings,
    engine: IGameEngine
  ) {
    this.engine = engine;
  }

  /**
   * Transfers hosting privileges to another player in the room.
   */
  public transferHost(newHostId: string): void {
    const exists = this.players.some((p) => p.id === newHostId);
    if (!exists) {
      throw new Error('Target player is not in this room.');
    }
    this.hostId = newHostId;
  }

  /**
   * Promotes the oldest connected player to host if the current host leaves.
   */
  public migrateHost(): boolean {
    const activePlayers = this.players.filter((p) => !p.isDisconnected && !p.isBot);
    if (activePlayers.length > 0) {
      // Find the player who is not a bot, not disconnected, and was added first
      // Since players array maintains join order, we grab the first eligible human player
      this.hostId = activePlayers[0].id;
      return true;
    }
    return false;
  }

  /**
   * Synchronizes the bot players based on current settings and human player count.
   */
  public syncBots(): void {
    if (this.engine.gameStatus !== 'LOBBY') return;

    if (!this.settings.enableBots) {
      // Remove all bots
      this.players = this.players.filter((p) => !p.isBot);
      this.engine.players = this.players;
      return;
    }

    // Keep human players
    const humans = this.players.filter((p) => !p.isBot);
    
    // We want to have maxPlayers total players
    const targetBotCount = Math.max(0, this.settings.maxPlayers - humans.length);
    
    // Get existing bots
    const existingBots = this.players.filter((p) => p.isBot);
    
    if (existingBots.length < targetBotCount) {
      // Add more bots
      const botsToAdd = targetBotCount - existingBots.length;
      for (let i = 0; i < botsToAdd; i++) {
        // Find a unique name like BOT_1, BOT_2, etc.
        let botNum = 1;
        while (this.players.some((p) => p.username === `BOT_${botNum}`)) {
          botNum++;
        }
        
        const botId = `bot_${Math.random().toString(36).substring(2, 9)}`;
        const bot = new Player(botId, `BOT_${botNum}`, `avatar_bot_${botNum}`, true, this.settings.botDifficulty);
        bot.isReady = true;
        this.players.push(bot);
      }
    } else if (existingBots.length > targetBotCount) {
      // Remove excess bots
      const botsToRemove = existingBots.length - targetBotCount;
      for (let i = 0; i < botsToRemove; i++) {
        const lastBotIndex = [...this.players].reverse().findIndex((p) => p.isBot);
        if (lastBotIndex !== -1) {
          const actualIndex = this.players.length - 1 - lastBotIndex;
          const botId = this.players[actualIndex].id;
          this.removePlayer(botId);
        }
      }
    }
    
    this.engine.players = this.players;
  }

  /**
   * Adds a player to the lobby.
   */
  public addPlayer(player: Player): void {
    if (this.banList.has(player.id)) {
      throw new Error('This player is banned from this room.');
    }

    const duplicate = this.players.some((p) => p.id === player.id);
    if (duplicate) return;

    if (this.players.length >= this.settings.maxPlayers) {
      // Try to evict a bot to make room for the joining player
      const botIndex = [...this.players].reverse().findIndex((p) => p.isBot);
      if (botIndex !== -1) {
        const actualIndex = this.players.length - 1 - botIndex;
        const evictedBot = this.players[actualIndex];
        this.removePlayer(evictedBot.id);
      } else {
        throw new Error('Room is full.');
      }
    }

    this.players.push(player);
    this.engine.players = this.players; // Keep sync
  }

  /**
   * Removes a player from the room.
   */
  public removePlayer(playerId: string): void {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
      this.engine.players = this.players; // Keep sync
    }
    this.clearBotTimer(playerId);
  }

  /**
   * Adds a spectator.
   */
  public addSpectator(id: string, username: string): void {
    if (!this.settings.allowSpectators) {
      throw new Error('Spectators are not allowed in this room.');
    }
    const duplicate = this.spectators.some((s) => s.id === id);
    if (duplicate) return;
    this.spectators.push({ id, username });
  }

  /**
   * Removes a spectator.
   */
  public removeSpectator(id: string): void {
    this.spectators = this.spectators.filter((s) => s.id !== id);
  }

  /**
   * Adds a chat message. Applies rate limits and duplicate suppression.
   */
  public addChatMessage(senderId: string, senderName: string, text: string): ChatMessage | null {
    const now = Date.now();
    const lastTime = this.lastChatTimestamps.get(senderId) || 0;

    // Rate limit: Max 1 message per second
    if (now - lastTime < 1000) {
      return null;
    }

    // Duplicate message suppression
    const cleanText = text.trim().slice(0, 120); // Truncate at 120 chars
    const lastContent = this.lastChatContents.get(senderId) || '';
    if (cleanText === lastContent) {
      return null;
    }

    this.lastChatTimestamps.set(senderId, now);
    this.lastChatContents.set(senderId, cleanText);

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      senderId,
      senderName,
      message: cleanText,
      timestamp: new Date(),
    };

    this.chatHistory.push(message);
    if (this.chatHistory.length > 50) {
      this.chatHistory.shift(); // Keep logs lean
    }

    return message;
  }

  /**
   * Helper to cancel a pending scheduled bot action for a player.
   */
  public clearBotTimer(playerId: string): void {
    const timer = this.botActionTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.botActionTimers.delete(playerId);
    }
  }

  /**
   * Cancels all scheduled bot timers in the room.
   */
  public clearAllBotTimers(): void {
    for (const timer of this.botActionTimers.values()) {
      clearTimeout(timer);
    }
    this.botActionTimers.clear();
  }
}
