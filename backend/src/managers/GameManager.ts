import { Room } from '../core/Room';
import { Player } from '../core/Player';
import { CardColor } from '../../../shared/src/types';
import { EngineFactory } from '../core/EngineFactory';
import { IBotStrategy, BotDecision } from '../core/IBotStrategy';
import { PlayerManager } from './PlayerManager';
import { RoomManager } from './RoomManager';
import { getSecureRandomInt } from '../core/DeckUtils';
import { prisma } from '../prismaClient';

export class GameManager {
  private static activeIo: any = null;
  private static roomTimers = new Map<string, { interval: NodeJS.Timeout, remaining: number }>();
  private static scoringTimers: Set<string> = new Set();

  public static setIo(io: any) {
    this.activeIo = io;
  }

  public static startTurnTimer(room: Room): void {
    const existing = this.roomTimers.get(room.roomCode);
    if (existing) {
      clearInterval(existing.interval);
      this.roomTimers.delete(room.roomCode);
    }

    if (room.engine.gameStatus !== 'PLAYING') {
      return;
    }

    const timerObj = {
      remaining: 10,
      interval: null as any
    };

    timerObj.interval = setInterval(() => {
      const activeObj = this.roomTimers.get(room.roomCode);
      if (!activeObj) return;

      activeObj.remaining--;
      if (activeObj.remaining < 0) {
        clearInterval(activeObj.interval);
        this.roomTimers.delete(room.roomCode);
        this.handleTurnTimeout(room);
      } else {
        this.broadcastState(room);
      }
    }, 1000);

    this.roomTimers.set(room.roomCode, timerObj);
    
    // Broadcast initial 10s state immediately
    this.broadcastState(room);
  }

  private static handleTurnTimeout(room: Room): void {
    try {
      room.engine.handleTimeout();
      this.broadcastState(room);
      this.startTurnTimer(room);
      this.checkAndScheduleBotAction(room);
    } catch (err) {
      console.error(`Error handling turn timeout in room ${room.roomCode}:`, err);
    }
  }

  public static clearTurnTimer(roomCode: string): void {
    const existing = this.roomTimers.get(roomCode);
    if (existing) {
      clearInterval(existing.interval);
      this.roomTimers.delete(roomCode);
    }
  }

  public static startScoringTimer(room: Room): void {
    if (this.scoringTimers.has(room.roomCode)) return;
    this.scoringTimers.add(room.roomCode);

    // Clear turn timer during reveal
    this.clearTurnTimer(room.roomCode);

    setTimeout(() => {
      this.scoringTimers.delete(room.roomCode);
      const activeRoom = RoomManager.getRoom(room.roomCode);
      if (activeRoom && activeRoom.engine.gameStatus === 'SCORING') {
        activeRoom.engine.gameStatus = 'GAME_OVER';
        activeRoom.engine.incrementStateVersion();
        this.broadcastState(activeRoom);
        this.handleGameOver(activeRoom);
      }
    }, 3000);
  }

  /**
   * Starts a game inside a room and schedules any initial bot turns.
   */
  public static startGame(room: Room, hostId: string): void {
    if (room.hostId !== hostId) {
      throw new Error('Only the host can start the game.');
    }

    room.engine.startGame(hostId);

    if (this.activeIo) {
      this.activeIo.to(room.roomCode).emit('server:gameStarted');
      this.broadcastState(room);
    }

    this.startTurnTimer(room);

    // Schedule bot play if game starts on a bot's turn
    this.checkAndScheduleBotAction(room);
  }

  /**
   * Resets the room and player states back to LOBBY status.
   */
  public static returnToLobby(room: Room, hostId: string): void {
    if (room.hostId !== hostId) {
      throw new Error('Only the host can return the room to the lobby.');
    }

    this.clearTurnTimer(room.roomCode);

    room.engine.gameStatus = 'LOBBY';
    room.engine.winnerId = null;
    room.engine.movesHistory = [];
    room.engine.matchDurationStr = null;
    room.engine.totalMoves = 0;
    room.engine.unoCalledBy.clear();
    room.engine.unoVulnerablePlayerId = null;

    for (const p of room.players) {
      p.hand = [];
      p.resetStats();
      p.isReady = p.isBot;
    }

    if (this.activeIo) {
      this.broadcastState(room);
    }
  }

  /**
   * Monitors the game status and schedules a bot decision if the active slot is a bot.
   */
  public static checkAndScheduleBotAction(room: Room): void {
    if (room.engine.gameStatus === 'GAME_OVER') {
      this.handleGameOver(room);
      return;
    }

    if (room.engine.gameStatus === 'SCORING') {
      this.startScoringTimer(room);
      return;
    }

    // Clear any leftover timers first
    room.clearAllBotTimers();

    // Case 1: Active turn is a Bot
    if (room.engine.gameStatus === 'PLAYING') {
      const engineAny = room.engine as any;

      // Handle Mercy special wait states for Bots
      if (engineAny.waitingForSwapTarget) {
        const swapSrcId = engineAny.swapSrcPlayerId;
        const bot = room.players.find((p) => p.id === swapSrcId);
        if (bot && bot.isBot) {
          this.scheduleBotSwapTarget(room, bot);
          return;
        }
      }

      if (engineAny.waitingForRouletteColor) {
        const targetId = engineAny.rouletteTargetPlayerId;
        const bot = room.players.find((p) => p.id === targetId);
        if (bot && bot.isBot) {
          this.scheduleBotRouletteColor(room, bot);
          return;
        }
      }

      const activePlayer = room.engine.getCurrentPlayer();
      if (activePlayer && activePlayer.isBot) {
        this.scheduleBotTurn(room, activePlayer);
      }
    }

    // Case 2: Challenge decision is pending for a Bot
    if (room.engine.gameStatus === 'CHALLENGE_WINDOW' && room.engine.challengeManager.active) {
      const challengerId = room.engine.challengeManager.challengerId;
      const challenger = room.players.find((p) => p.id === challengerId);
      if (challenger && challenger.isBot) {
        this.scheduleBotChallenge(room, challenger);
      }
    }
  }

  /**
   * Schedules a swap target selection for a Mercy bot.
   */
  private static scheduleBotSwapTarget(room: Room, bot: Player): void {
    const delay = this.getBotDelay(bot.botDifficulty || 'EASY');
    const timeout = setTimeout(() => {
      try {
        room.botActionTimers.delete(bot.id);
        const botStrategy = EngineFactory.createBotStrategy(room.settings.gameVariant);
        const engineAny = room.engine as any;
        const opponents = room.players
          .filter((p) => p.id !== bot.id && !engineAny.eliminatedPlayers.has(p.id))
          .map((p) => ({ id: p.id, handSize: p.hand.length }));

        if (botStrategy.selectSwapTarget) {
          const targetId = botStrategy.selectSwapTarget(bot, opponents);
          engineAny.selectSwapTarget(bot.id, targetId);
          this.broadcastState(room);
          this.startTurnTimer(room);
          this.checkAndScheduleBotAction(room);
        }
      } catch (err) {
        console.error(`Error in Mercy Bot swap target selection for room ${room.roomCode}:`, err);
      }
    }, delay);
    room.botActionTimers.set(bot.id, timeout);
  }

  /**
   * Schedules a color selection for Color Roulette for a Mercy bot.
   */
  private static scheduleBotRouletteColor(room: Room, bot: Player): void {
    const delay = this.getBotDelay(bot.botDifficulty || 'EASY');
    const timeout = setTimeout(() => {
      try {
        room.botActionTimers.delete(bot.id);
        const botStrategy = EngineFactory.createBotStrategy(room.settings.gameVariant);
        const engineAny = room.engine as any;

        if (botStrategy.selectRouletteColor) {
          const chosenColor = botStrategy.selectRouletteColor(bot);
          engineAny.selectRouletteColor(bot.id, chosenColor);
          this.broadcastState(room);
          this.startTurnTimer(room);
          this.checkAndScheduleBotAction(room);
        }
      } catch (err) {
        console.error(`Error in Mercy Bot roulette color selection for room ${room.roomCode}:`, err);
      }
    }, delay);
    room.botActionTimers.set(bot.id, timeout);
  }

  /**
   * Schedules a normal turn decision for a bot.
   */
  private static scheduleBotTurn(room: Room, bot: Player): void {
    const delay = this.getBotDelay(bot.botDifficulty || 'EASY');
    const botStrategy = EngineFactory.createBotStrategy(room.settings.gameVariant);

    const timeout = setTimeout(() => {
      try {
        room.botActionTimers.delete(bot.id);

        // Prepare list of opponents and hand sizes for bot heuristics
        const engineAny = room.engine as any;
        const eliminated = engineAny.eliminatedPlayers || new Set();
        const opponents = room.players
          .filter((p) => p.id !== bot.id && !eliminated.has(p.id))
          .map((p) => ({ id: p.id, handSize: p.hand.length }));

        const topDiscard = room.engine.discardPile[room.engine.discardPile.length - 1];
        const decision = botStrategy.makeTurnDecision(
          bot,
          topDiscard,
          room.engine.currentColor,
          opponents,
          room.engine.hasDrawnThisTurn,
          room.engine.drawnCardThisTurn,
          engineAny.stackedDrawTotal || 0
        );

        // Execute decision
        if (decision.action === 'PLAY') {
          if (decision.callUno) {
            room.engine.callUno(bot.id);
          }
          room.engine.playCard(bot.id, decision.cardId!, decision.chosenColor);
        } else if (decision.action === 'DRAW') {
          room.engine.drawCard(bot.id);
        } else if (decision.action === 'PASS') {
          room.engine.passTurn(bot.id);
        }

        // Broadcast updated state
        this.broadcastState(room);
        this.startTurnTimer(room);

        // Check next player turn
        this.checkAndScheduleBotAction(room);
      } catch (err) {
        console.error(`Error in Bot turn execution for room ${room.roomCode}:`, err);
      }
    }, delay);

    room.botActionTimers.set(bot.id, timeout);
  }


  /**
   * Schedules a WD4 challenge decision for a bot.
   */
  private static scheduleBotChallenge(room: Room, bot: Player): void {
    const delay = this.getBotDelay(bot.botDifficulty || 'EASY');
    const botStrategy = EngineFactory.createBotStrategy(room.settings.gameVariant);

    const timeout = setTimeout(() => {
      try {
        room.botActionTimers.delete(bot.id);

        const challengedId = room.engine.challengeManager.challengedId;
        const challengedPlayer = room.players.find((p) => p.id === challengedId)!;

        const shouldChallenge = botStrategy.makeChallengeDecision(
          bot,
          challengedPlayer.hand.length
        );

        room.engine.executeChallenge(bot.id, shouldChallenge);

        // Broadcast updated state
        this.broadcastState(room);
        this.startTurnTimer(room);

        // Check next turn
        this.checkAndScheduleBotAction(room);
      } catch (err) {
        console.error(`Error in Bot challenge execution for room ${room.roomCode}:`, err);
      }
    }, delay);

    room.botActionTimers.set(bot.id, timeout);
  }

  /**
   * Broadcasts masked states to all sockets in the room.
   */
  public static broadcastState(room: Room): void {
    if (!this.activeIo) return;

    const timerObj = this.roomTimers.get(room.roomCode);
    const remainingTime = timerObj ? timerObj.remaining : 10;
    const variant = room.settings.gameVariant;

    // Send to active players (each gets their own hand, others masked)
    for (const player of room.players) {
      if (player.isBot) continue;

      const playerState = {
        gameVariant: variant,
        players: room.players.map((p) => ({
          id: p.id,
          username: p.username,
          avatarId: p.avatarId,
          handSize: p.hand.length,
          isBot: p.isBot,
          isDisconnected: p.isDisconnected,
        })),
        myHand: player.hand,
        topDiscardCard: room.engine.discardPile[room.engine.discardPile.length - 1],
        currentColor: room.engine.currentColor,
        direction: room.engine.turnManager.direction,
        currentPlayerIndex: room.engine.turnManager.currentPlayerIndex,
        winnerId: room.engine.winnerId,
        stateVersion: room.engine.stateVersion,
        drawPileSize: room.engine.deck.length,
        pendingChallenge: room.engine.gameStatus === 'CHALLENGE_WINDOW',
        waitingForStartingColor: room.engine.waitingForStartingColor,
        gameStatus: room.engine.gameStatus,
        challengeTarget: room.engine.gameStatus === 'CHALLENGE_WINDOW' ? room.engine.challengeManager.challengerId : null,
        remainingTime,
        movesHistory: room.engine.movesHistory,
        matchDuration: room.engine.matchDurationStr,
        totalMoves: room.engine.totalMoves,
        mostUsedColor: room.engine.getMostUsedColor(),
        matchStatistics: room.engine.getMatchStatistics(),
        hostId: room.hostId,
        spectatorCount: room.spectators.length,
        // Variant-specific fields (engines that don't have these return undefined, which is fine)
        activeSide: (room.engine as any).activeSide,
        eliminatedPlayers: (room.engine as any).eliminatedPlayers ? Array.from((room.engine as any).eliminatedPlayers) : undefined,
        stackedDrawTotal: (room.engine as any).stackedDrawTotal,
        pendingSwapTarget: (room.engine as any).waitingForSwapTarget && (room.engine as any).swapSrcPlayerId === player.id,
        pendingRouletteColor: (room.engine as any).waitingForRouletteColor && (room.engine as any).rouletteTargetPlayerId === player.id,
      };

      this.activeIo.to(player.id).emit('server:stateUpdated', playerState);
    }

    // Send to spectators (all hands masked, optionally delayed by spectator settings)
    const specState = {
      gameVariant: variant,
      players: room.players.map((p) => ({
        id: p.id,
        username: p.username,
        avatarId: p.avatarId,
        handSize: p.hand.length,
        isBot: p.isBot,
        isDisconnected: p.isDisconnected,
      })),
      topDiscardCard: room.engine.discardPile[room.engine.discardPile.length - 1],
      currentColor: room.engine.currentColor,
      direction: room.engine.turnManager.direction,
      currentPlayerIndex: room.engine.turnManager.currentPlayerIndex,
      winnerId: room.engine.winnerId,
      stateVersion: room.engine.stateVersion,
      drawPileSize: room.engine.deck.length,
      gameStatus: room.engine.gameStatus,
      challengeTarget: room.engine.gameStatus === 'CHALLENGE_WINDOW' ? room.engine.challengeManager.challengerId : null,
      remainingTime,
      movesHistory: room.engine.movesHistory,
      matchDuration: room.engine.matchDurationStr,
      totalMoves: room.engine.totalMoves,
      mostUsedColor: room.engine.getMostUsedColor(),
      matchStatistics: room.engine.getMatchStatistics(),
      hostId: room.hostId,
      spectatorCount: room.spectators.length,
      activeSide: (room.engine as any).activeSide,
      eliminatedPlayers: (room.engine as any).eliminatedPlayers ? Array.from((room.engine as any).eliminatedPlayers) : undefined,
      stackedDrawTotal: (room.engine as any).stackedDrawTotal,
    };

    if (room.settings.spectatorDelaySec > 0) {
      // Enforce delayed dispatch queue on server side
      setTimeout(() => {
        if (room.spectators.length > 0) {
          this.activeIo.to(`${room.roomCode}-specs`).emit('server:spectatorStateUpdated', specState);
        }
      }, room.settings.spectatorDelaySec * 1000);
    } else {
      if (room.spectators.length > 0) {
        this.activeIo.to(`${room.roomCode}-specs`).emit('server:spectatorStateUpdated', specState);
      }
    }
  }

  /**
   * Finalizes the match result and records metrics to database.
   */
  private static async handleGameOver(room: Room): Promise<void> {
    const winnerId = room.engine.winnerId;
    if (!winnerId) return;

    if (this.activeIo) {
      this.activeIo.to(room.roomCode).emit('server:winner', {
        winnerId,
        movesHistory: room.engine.movesHistory,
      });
    }

    // Determine duration
    const firstMove = room.engine.movesHistory[0];
    const duration = firstMove
      ? Math.floor((Date.now() - new Date(firstMove.timestamp).getTime()) / 1000)
      : 0;

    try {
      // 1. Create Match log
      const match = await prisma.match.create({
        data: {
          roomCode: room.roomCode,
          winnerId,
          durationSec: duration,
          turnsPlayed: room.engine.movesHistory.length,
          gameVariant: room.settings.gameVariant,
        },
      });

      // 2. Add Moves history in batch
      if (room.engine.movesHistory.length > 0) {
        await prisma.gameMove.createMany({
          data: room.engine.movesHistory.map((m) => ({
            matchId: match.id,
            turnIndex: m.turnIndex,
            playerId: m.playerId,
            playerName: m.playerName,
            action: m.action,
            card: m.card,
            color: m.color,
            timestamp: m.timestamp,
          })),
        });
      }

      // 3. Write individual Player Profile Stats
      for (const p of room.players) {
        if (p.isBot) continue;

        // Count items in moves list
        const played = room.engine.movesHistory.filter((m) => m.playerId === p.id && m.action === 'PLAY');
        const drawn = room.engine.movesHistory.filter((m) => m.playerId === p.id && m.action === 'DRAW');
        const unoCalls = room.engine.movesHistory.filter((m) => m.playerId === p.id && m.action === 'UNO');

        const playedColors: Record<string, number> = {};
        for (const move of played) {
          if (move.card) {
            const parts = move.card.split('_');
            const color = parts[0] === 'WILD' ? 'WILD' : parts[0];
            playedColors[color] = (playedColors[color] || 0) + 1;
          }
        }

        const won = p.id === winnerId;

        // Persist to SQLite
        await PlayerManager.updateStatsAfterMatch(p.id, won, {
          cardsPlayed: played.length,
          cardsDrawn: drawn.length,
          unoCalls: unoCalls.length,
          playedColors,
        });
      }
    } catch (err) {
      console.error('Error writing match persistence details to SQLite:', err);
    }
  }

  /**
   * Helper to fetch thinking delay based on bot difficulty.
   */
  private static getBotDelay(difficulty: 'EASY' | 'MEDIUM' | 'HARD'): number {
    if (difficulty === 'HARD') {
      return 300 + getSecureRandomInt(400); // 300ms - 700ms
    }
    if (difficulty === 'MEDIUM') {
      return 700 + getSecureRandomInt(500); // 700ms - 1200ms
    }
    return 1000 + getSecureRandomInt(500); // 1000ms - 1500ms
  }
}
