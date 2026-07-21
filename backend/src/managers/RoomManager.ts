import { Room } from '../core/Room';
import { RoomSettings } from '../../../shared/src/types';
import { generateRoomCode } from '../core/DeckUtils';
import { EngineFactory } from '../core/EngineFactory';

export class RoomManager {
  private static rooms: Map<string, Room> = new Map();

  /**
   * Creates a new game room with a guaranteed unique 7-digit code.
   */
  public static createRoom(hostId: string, settings: RoomSettings): Room {
    let roomCode = generateRoomCode();
    let retries = 0;

    // Resolve any rare cryptographic collisions
    while (this.rooms.has(roomCode) && retries < 1000) {
      roomCode = generateRoomCode();
      retries++;
    }

    if (this.rooms.has(roomCode)) {
      throw new Error('Failed to generate a unique room code. Try again.');
    }

    const engine = EngineFactory.createEngine(settings.gameVariant, settings);
    const room = new Room(roomCode, hostId, settings, engine);
    this.rooms.set(roomCode, room);
    return room;
  }

  /**
   * Retrieves an active room by its 7-digit code.
   */
  public static getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  /**
   * Closes a room and cleans up scheduled bots.
   */
  public static deleteRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.clearAllBotTimers();
      this.rooms.delete(roomCode);
    }
  }

  /**
   * Lists all active rooms (useful for room browsers if public).
   */
  public static getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
