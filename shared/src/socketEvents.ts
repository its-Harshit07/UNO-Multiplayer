import { CardColor, RoomSettings, ChatMessage, PlayerGameState, SpectatorGameState } from './types';

export interface ClientEvents {
  'client:createRoom': (
    payload: { username: string; avatarId: string; settings: RoomSettings },
    callback: (response: { success: boolean; roomCode?: string; profile?: any; reconnectToken?: string; error?: string }) => void
  ) => void;
  'client:joinRoom': (
    payload: { roomCode: string; username: string; avatarId: string; isSpectator: boolean },
    callback: (response: { success: boolean; profile?: any; reconnectToken?: string; error?: string }) => void
  ) => void;
  'client:leaveRoom': () => void;
  'client:kickPlayer': (payload: { targetPlayerId: string }) => void;
  'client:banPlayer': (payload: { targetPlayerId: string }) => void;
  'client:transferHost': (payload: { targetPlayerId: string }) => void;
  'client:regenerateCode': () => void;
  'client:updateSettings': (settings: RoomSettings) => void;
  'client:ready': (payload: { isReady: boolean }) => void;
  'client:startGame': () => void;
  'client:playCard': (payload: { cardId: string; chosenColor?: CardColor; expectedStateVersion: number }) => void;
  'client:selectStartingColor': (payload: { chosenColor: CardColor; expectedStateVersion: number }) => void;
  'client:drawCard': (payload: { expectedStateVersion: number }) => void;
  'client:passTurn': (payload: { expectedStateVersion: number }) => void;
  'client:uno': () => void;
  'client:catchUno': (payload: { targetPlayerId: string }) => void;
  'client:challenge': (payload: { shouldChallenge: boolean; expectedStateVersion: number }) => void;
  'client:chat': (payload: { message: string }) => void;
  'client:emoji': (payload: { emojiCode: string }) => void;
  'client:reconnect': (
    payload: { reconnectToken: string; roomCode: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;
}

export interface ServerEvents {
  'server:roomCreated': (roomCode: string) => void;
  'server:playerJoined': (players: any[]) => void;
  'server:gameStarted': () => void;
  'server:stateUpdated': (state: PlayerGameState) => void;
  'server:spectatorStateUpdated': (state: SpectatorGameState) => void;
  'server:chat': (message: ChatMessage) => void;
  'server:emoji': (payload: { playerId: string; emojiCode: string }) => void;
  'server:winner': (payload: { winnerId: string; movesHistory: any[] }) => void;
  'server:error': (payload: { message: string }) => void;
}
