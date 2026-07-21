import { Server, Socket } from 'socket.io';
import { RoomManager } from '../managers/RoomManager';
import { PlayerManager } from '../managers/PlayerManager';
import { GameManager } from '../managers/GameManager';
import { ReconnectManager } from '../managers/ReconnectManager';
import { Player } from '../core/Player';
import { RoomSettings, CardColor } from '../../../shared/src/types';
import { MAX_PACKETS_PER_SEC, DISCONNECT_TIMEOUT_MS, MAX_CHAT_LENGTH } from '../config';

// Map of room code to execution queues for thread-safe atomicity
class TaskQueue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;

  public async push(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await task();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const task = this.queue.shift()!;
    try {
      await task();
    } catch (err) {
      console.error('Error executing task in queue:', err);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }
}

const roomQueues: Map<string, TaskQueue> = new Map();

function getOrCreateQueue(roomCode: string): TaskQueue {
  let queue = roomQueues.get(roomCode);
  if (!queue) {
    queue = new TaskQueue();
    roomQueues.set(roomCode, queue);
  }
  return queue;
}

// Track connections for cleanup
interface SocketData {
  playerId?: string;
  roomCode?: string;
  isSpectator?: boolean;
}

const socketDataMap: Map<string, SocketData> = new Map();
const socketRateLimits: Map<string, { count: number; resetTime: number }> = new Map();

/**
 * Validates rate limit of incoming messages.
 */
function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const limit = socketRateLimits.get(socketId) || { count: 0, resetTime: now + 1000 };

  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + 1000;
  } else {
    limit.count++;
  }

  socketRateLimits.set(socketId, limit);
  return limit.count > MAX_PACKETS_PER_SEC;
}

function kickDuplicateSockets(io: Server, playerId: string, currentSocketId: string) {
  for (const [sid, data] of socketDataMap.entries()) {
    if (data.playerId === playerId && sid !== currentSocketId) {
      const oldSocket = io.sockets.sockets.get(sid);
      if (oldSocket) {
        oldSocket.emit('server:error', { message: 'You logged in from another location/tab.' });
        oldSocket.disconnect(true);
      }
      socketDataMap.delete(sid);
      socketRateLimits.delete(sid);
    }
  }
}

export function registerSocketHandlers(io: Server) {
  GameManager.setIo(io);

  io.on('connection', (socket: Socket) => {
    socketDataMap.set(socket.id, {});

    // Packet rate limiter middleware
    socket.use((packet, next) => {
      if (isRateLimited(socket.id)) {
        socket.emit('server:error', { message: 'Too many requests. Please slow down.' });
        return; // Drop packet
      }
      next();
    });

    // 1. Create Room
    socket.on('client:createRoom', async (payload: { username: string; avatarId: string; settings: RoomSettings }, callback) => {
      const { username, avatarId, settings } = payload;
      try {
        const profile = await PlayerManager.getOrCreateProfile(username, avatarId);

        const room = RoomManager.createRoom(profile.id, settings);
        const hostPlayer = new Player(
          profile.id,
          profile.username,
          profile.avatarId,
          false
        );

        room.addPlayer(hostPlayer);
        room.syncBots();

        socketDataMap.set(socket.id, {
          playerId: profile.id,
          roomCode: room.roomCode,
          isSpectator: false,
        });

        // Join room channel
        socket.join(room.roomCode);
        socket.join(profile.id); // personal channel

        // Emit server:playerJoined to initialize the creator's lobby
        io.to(room.roomCode).emit('server:playerJoined', room.players.map(p => ({
          id: p.id,
          username: p.username,
          avatarId: p.avatarId,
          isReady: p.isReady,
          isBot: p.isBot,
        })));

        callback({
          success: true,
          roomCode: room.roomCode,
          profile,
          reconnectToken: hostPlayer.reconnectToken
        });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    // 2. Join Room
    socket.on('client:joinRoom', async (payload, callback) => {
      const { roomCode, username, avatarId, isSpectator } = payload;

      const queue = getOrCreateQueue(roomCode);
      await queue.push(async () => {
        try {
          const room = RoomManager.getRoom(roomCode);
          if (!room) {
            callback({ success: false, error: 'Room not found.' });
            return;
          }

          const profile = await PlayerManager.getOrCreateProfile(username, avatarId);

          // Find and clean up any existing duplicate socket connections for this player profile
          kickDuplicateSockets(io, profile.id, socket.id);

          const isPlayerInRoom = room.players.some((p) => p.id === profile.id);

          if (isSpectator) {
            if (!room.settings.allowSpectators) {
              callback({ success: false, error: 'Spectating is disabled for this room.' });
              return;
            }
            if (room.spectators.length >= 10) {
              callback({ success: false, error: 'Spectator limit reached.' });
              return;
            }
            if (room.engine.gameStatus !== 'LOBBY') {
              callback({ success: false, error: 'This match is already in progress.' });
              return;
            }
            if (isPlayerInRoom) {
              callback({ success: false, error: 'You are registered as a player in this room. You cannot join as a spectator.' });
              return;
            }
            if (room.spectators.some((s) => s.id === profile.id)) {
              callback({ success: false, error: 'You are already spectating this room.' });
              return;
            }

            room.addSpectator(profile.id, profile.username);
            socketDataMap.set(socket.id, { playerId: profile.id, roomCode, isSpectator: true });
            socket.join(roomCode);
            socket.join(`${roomCode}-specs`);
            socket.join(profile.id);

            callback({ success: true, profile });
            GameManager.broadcastState(room);
            return;
          }

          // Join as Player
          if (room.engine.gameStatus !== 'LOBBY') {
            callback({ success: false, error: 'This match has already started. You cannot join as a player.' });
            return;
          }

          if (isPlayerInRoom) {
            callback({ success: false, error: 'You are already registered as a player in this room.' });
            return;
          }

          const isNameTaken = room.players.some((p) => p.username.toLowerCase() === username.toLowerCase());
          if (isNameTaken) {
            callback({ success: false, error: 'This username is already taken in the room.' });
            return;
          }

          const botCount = room.players.filter((p) => p.isBot).length;
          if (room.players.length >= room.settings.maxPlayers && botCount === 0) {
            callback({ success: false, error: 'Room is full.' });
            return;
          }

          const player = new Player(
            profile.id,
            profile.username,
            profile.avatarId,
            false
          );

          room.addPlayer(player);
          room.syncBots();

          socketDataMap.set(socket.id, { playerId: profile.id, roomCode, isSpectator: false });
          socket.join(roomCode);
          socket.join(profile.id);

          callback({
            success: true,
            profile,
            reconnectToken: player.reconnectToken,
          });

          // Broadcast join status
          io.to(roomCode).emit('server:playerJoined', room.players.map(p => ({
            id: p.id,
            username: p.username,
            avatarId: p.avatarId,
            isReady: p.isReady,
            isBot: p.isBot,
          })));

          if (room.engine.gameStatus !== 'LOBBY') {
            GameManager.broadcastState(room);
          }
        } catch (err: any) {
          callback({ success: false, error: err.message });
        }
      });
    });

    // 3. Ready Toggle
    socket.on('client:ready', async (payload: { isReady: boolean }) => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const room = RoomManager.getRoom(sData.roomCode);
      if (!room) return;

      const player = room.players.find((p) => p.id === sData.playerId);
      if (player) {
        player.isReady = payload.isReady;
        // Broadcast players list
        io.to(room.roomCode).emit('server:playerJoined', room.players.map(p => ({
          id: p.id,
          username: p.username,
          avatarId: p.avatarId,
          isReady: p.isReady,
          isBot: p.isBot,
        })));
      }
    });

    // 4. Update Settings
    socket.on('client:updateSettings', (settings: RoomSettings) => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const room = RoomManager.getRoom(sData.roomCode);
      if (!room || room.hostId !== sData.playerId) return;

      room.settings = settings;
      room.engine.roomSettings.maxPlayers = settings.maxPlayers;
      room.engine.roomSettings.isPublic = settings.isPublic;
      room.engine.roomSettings.turnTimerLimit = settings.turnTimerLimit;
      room.engine.roomSettings.allowSpectators = settings.allowSpectators;
      room.engine.roomSettings.enableBots = settings.enableBots;
      room.engine.roomSettings.botDifficulty = settings.botDifficulty;
      room.engine.roomSettings.houseRules = settings.houseRules;

      room.syncBots();

      // Broadcast players list
      io.to(room.roomCode).emit('server:playerJoined', room.players.map(p => ({
        id: p.id,
        username: p.username,
        avatarId: p.avatarId,
        isReady: p.isReady,
        isBot: p.isBot,
      })));
    });

    // 5. Start Game
    socket.on('client:startGame', async () => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        try {
          const room = RoomManager.getRoom(sData.roomCode!);
          if (!room) return;
          GameManager.startGame(room, sData.playerId!);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 5b. Play Again
    socket.on('client:playAgain', async () => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        try {
          const room = RoomManager.getRoom(sData.roomCode!);
          if (!room) return;
          GameManager.startGame(room, sData.playerId!);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 5c. Return Lobby
    socket.on('client:returnLobby', async () => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        try {
          const room = RoomManager.getRoom(sData.roomCode!);
          if (!room) return;
          GameManager.returnToLobby(room, sData.playerId!);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 6. Play Card
    socket.on('client:playCard', async (payload) => {
      const { cardId, chosenColor, expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        // Version Validation Lock check
        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync action. State updated.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          room.engine.playCard(sData.playerId!, cardId, chosenColor);
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
          GameManager.broadcastState(room); // Rollback optimistic UI
        }
      });
    });

    // 7. Select Starting Color
    socket.on('client:selectStartingColor', async (payload) => {
      const { chosenColor, expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync color choice.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          room.engine.selectStartingColor(sData.playerId!, chosenColor);
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 8. Draw Card
    socket.on('client:drawCard', async (payload) => {
      const { expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync draw action.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          room.engine.drawCard(sData.playerId!);
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 9. Pass Turn
    socket.on('client:passTurn', async (payload) => {
      const { expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync pass action.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          room.engine.passTurn(sData.playerId!);
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 10. Call UNO
    socket.on('client:uno', () => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const room = RoomManager.getRoom(sData.roomCode);
      if (!room) return;

      try {
        room.engine.callUno(sData.playerId);
        GameManager.broadcastState(room);
      } catch (err: any) {
        socket.emit('server:error', { message: err.message });
      }
    });

    // 11. Catch UNO
    socket.on('client:catchUno', (payload: { targetPlayerId: string }) => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const room = RoomManager.getRoom(sData.roomCode);
      if (!room) return;

      try {
        room.engine.catchUno(sData.playerId, payload.targetPlayerId);
        GameManager.broadcastState(room);
      } catch (err: any) {
        socket.emit('server:error', { message: err.message });
      }
    });

    // 12. Challenge Wild Draw 4
    socket.on('client:challenge', async (payload) => {
      const { shouldChallenge, expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync challenge response.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          room.engine.executeChallenge(sData.playerId!, shouldChallenge);
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 12b. Select Swap Target (7s Swap)
    socket.on('client:selectSwapTarget', async (payload) => {
      const { targetPlayerId, expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync swap action.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          const engineAny = room.engine as any;
          if (typeof engineAny.selectSwapTarget === 'function') {
            engineAny.selectSwapTarget(sData.playerId!, targetPlayerId);
          }
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });

    // 12c. Select Roulette Color (Wild Color Roulette)
    socket.on('client:selectRouletteColor', async (payload) => {
      const { chosenColor, expectedStateVersion } = payload;
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const queue = getOrCreateQueue(sData.roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(sData.roomCode!);
        if (!room) return;

        if (room.engine.stateVersion !== expectedStateVersion) {
          socket.emit('server:error', { message: 'Out of sync roulette choice.' });
          GameManager.broadcastState(room);
          return;
        }

        try {
          const engineAny = room.engine as any;
          if (typeof engineAny.selectRouletteColor === 'function') {
            engineAny.selectRouletteColor(sData.playerId!, chosenColor);
          }
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
          GameManager.checkAndScheduleBotAction(room);
        } catch (err: any) {
          socket.emit('server:error', { message: err.message });
        }
      });
    });


    // 13. Reconnect
    socket.on('client:reconnect', async (payload, callback) => {
      const { reconnectToken, roomCode, playerId, username, avatarId, isSpectator } = payload;

      const queue = getOrCreateQueue(roomCode);
      await queue.push(async () => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found.' });
          return;
        }

        if (room.engine.gameStatus === 'GAME_OVER') {
          GameManager.returnToLobby(room, room.hostId);
        }

        if (isSpectator) {
          if (playerId) {
            kickDuplicateSockets(io, playerId, socket.id);
          }
          // Reconnect Spectator
          const specExists = room.spectators.some((s) => s.id === playerId);
          if (!specExists && playerId && username) {
            room.addSpectator(playerId, username);
          }

          socketDataMap.set(socket.id, {
            playerId: playerId || `spec_${Math.random().toString(36).substring(2, 9)}`,
            roomCode,
            isSpectator: true,
          });

          socket.join(roomCode);
          socket.join(`${roomCode}-specs`);
          if (playerId) {
            socket.join(playerId);
          }

          callback({ success: true, isSpectator: true });
          GameManager.broadcastState(room);
          return;
        }

        // Reconnect Player
        const player = room.players.find((p) => p.reconnectToken === reconnectToken || p.id === playerId);
        if (!player) {
          callback({ success: false, error: 'Invalid reconnect token or playerId.' });
          return;
        }

        kickDuplicateSockets(io, player.id, socket.id);

        // Reconnect success: cancel reconnect timer
        ReconnectManager.cancelTimer(player.id);
        player.isDisconnected = false;

        socketDataMap.set(socket.id, {
          playerId: player.id,
          roomCode,
          isSpectator: false,
        });

        socket.join(roomCode);
        socket.join(player.id);

        callback({ success: true });
        if (room.engine.gameStatus !== 'LOBBY') {
          GameManager.broadcastState(room);
          GameManager.startTurnTimer(room);
        }

        // Resume bot schedule check if it was waiting on this player
        GameManager.checkAndScheduleBotAction(room);
      });
    });

    // 14. Chat
    socket.on('client:chat', (payload) => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      const room = RoomManager.getRoom(sData.roomCode);
      if (!room) return;

      const player = room.players.find((p) => p.id === sData.playerId);
      if (!player) return;

      const msg = room.addChatMessage(player.id, player.username, payload.message);
      if (msg) {
        io.to(room.roomCode).emit('server:chat', msg);
      }
    });

    // 15. Emoji Reaction
    socket.on('client:emoji', (payload) => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) return;

      io.to(sData.roomCode).emit('server:emoji', {
        playerId: sData.playerId,
        emojiCode: payload.emojiCode,
      });
    });

    // 16. Disconnect
    socket.on('disconnect', () => {
      const sData = socketDataMap.get(socket.id);
      if (!sData?.roomCode || !sData?.playerId) {
        socketDataMap.delete(socket.id);
        socketRateLimits.delete(socket.id);
        return;
      }

      const roomCode = sData.roomCode;
      const playerId = sData.playerId;

      socketDataMap.delete(socket.id);
      socketRateLimits.delete(socket.id);

      const queue = getOrCreateQueue(roomCode);
      queue.push(async () => {
        const room = RoomManager.getRoom(roomCode);
        if (!room) return;

        if (sData.isSpectator) {
          room.removeSpectator(playerId);
          if (room.engine.gameStatus !== 'LOBBY') {
            GameManager.broadcastState(room);
          }
          return;
        }

        const player = room.players.find((p) => p.id === playerId);
        if (!player) return;

        // If game is actively playing, trigger 120s reconnect timer
        if (room.engine.gameStatus === 'PLAYING' || room.engine.gameStatus === 'CHALLENGE_WINDOW') {
          player.isDisconnected = true;
          GameManager.broadcastState(room);

          ReconnectManager.startTimer(playerId, () => {
            // Reconnect timeout expired!
            const expiredQueue = getOrCreateQueue(roomCode);
            expiredQueue.push(async () => {
              const activeRoom = RoomManager.getRoom(roomCode);
              if (!activeRoom) return;

              const activePlayer = activeRoom.players.find((p) => p.id === playerId);
              if (!activePlayer) return;

              if (activeRoom.settings.enableBots) {
                // Replace with Bot
                const botPlayer = new Player(
                  activePlayer.id,
                  `${activePlayer.username} [BOT]`,
                  activePlayer.avatarId,
                  true,
                  activeRoom.settings.botDifficulty
                );
                botPlayer.hand = activePlayer.hand;
                botPlayer.isReady = true;

                const index = activeRoom.players.findIndex((p) => p.id === playerId);
                if (index !== -1) {
                  activeRoom.players[index] = botPlayer;
                  activeRoom.engine.players = activeRoom.players;
                }

                GameManager.broadcastState(activeRoom);
                GameManager.checkAndScheduleBotAction(activeRoom);
              } else {
                // Forfeit: remove player, check if game should end
                activeRoom.removePlayer(playerId);

                // If only 1 human player left, they win
                const remainingHumans = activeRoom.players.filter((p) => !p.isBot);
                if (remainingHumans.length <= 1) {
                  const winner = remainingHumans[0] || activeRoom.players[0];
                  if (winner) {
                    activeRoom.engine.endGame(winner.id);
                  }
                }

                // Migrate host if host left
                if (activeRoom.hostId === playerId) {
                  activeRoom.migrateHost();
                }

                GameManager.broadcastState(activeRoom);
                GameManager.checkAndScheduleBotAction(activeRoom);
              }
            });
          });
        } else if (room.engine.gameStatus === 'GAME_OVER') {
          // Keep player in the room to avoid corrupting leaderboard, just mark disconnected flag
          player.isDisconnected = true;
          GameManager.broadcastState(room);
        } else {
          // If in lobby, remove player instantly
          room.removePlayer(playerId);
          room.syncBots();

          if (room.hostId === playerId) {
            const hasNewHost = room.migrateHost();
            if (!hasNewHost) {
              RoomManager.deleteRoom(roomCode);
              return;
            }
          }

          // Broadcast players list
          io.to(roomCode).emit('server:playerJoined', room.players.map(p => ({
            id: p.id,
            username: p.username,
            avatarId: p.avatarId,
            isReady: p.isReady,
            isBot: p.isBot,
          })));

          if (room.engine.gameStatus !== 'LOBBY') {
            GameManager.broadcastState(room);
          }
        }
      });
    });
  });
}
