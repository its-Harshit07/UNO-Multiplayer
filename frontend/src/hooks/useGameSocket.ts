import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { PlayerGameState, SpectatorGameState, Card, CardColor, RoomSettings } from '../../../shared/src/types';


const SOCKET_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : 'http://localhost:3000');

export function useGameSocket(onSoundPlay: (type: 'play' | 'draw' | 'shuffle' | 'tick' | 'uno' | 'victory') => void) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: string; username: string; avatarId: string } | null>(null);
  const [gameState, setGameState] = useState<PlayerGameState | null>(null);
  const [spectatorState, setSpectatorState] = useState<SpectatorGameState | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<{ id: string; username: string; avatarId: string; isReady: boolean }[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [activeEmoji, setActiveEmoji] = useState<{ playerId: string; emojiCode: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Optimistic UI local hand state
  const [optimisticHand, setOptimisticHand] = useState<Card[] | null>(null);

  const prevVersionRef = useRef<number>(0);
  const soundPlayRef = useRef(onSoundPlay);
  soundPlayRef.current = onSoundPlay;

  useEffect(() => {
    const s = io(SOCKET_URL, { autoConnect: false });
    setSocket(s);

    s.on('connect', () => {
      setErrorMsg(null);
    });

    s.on('connect_error', () => {
      setErrorMsg('Failed to connect to server. Retrying...');
    });

    s.on('server:roomCreated', (code: string) => {
      setRoomCode(code);
    });

    s.on('server:playerJoined', (players: any[]) => {
      setLobbyPlayers(players);
    });

    s.on('server:stateUpdated', (state: PlayerGameState) => {
      // Sound cues based on state transition
      if (state.stateVersion > prevVersionRef.current) {
        if (state.winnerId) {
          soundPlayRef.current('victory');
        } else if (state.pendingChallenge) {
          soundPlayRef.current('uno');
        } else if (prevVersionRef.current > 0) {
          soundPlayRef.current('play');
        }
        prevVersionRef.current = state.stateVersion;
      }

      setGameState(state);
      setOptimisticHand(null); // Clear optimistic hand on authoritative update
    });

    s.on('server:spectatorStateUpdated', (state: SpectatorGameState) => {
      setSpectatorState(state);
    });

    s.on('server:chat', (msg: any) => {
      setChatMessages((prev) => [...prev, msg].slice(-50));
    });

    s.on('server:emoji', (payload: { playerId: string; emojiCode: string }) => {
      setActiveEmoji(payload);
      setTimeout(() => setActiveEmoji(null), 3000); // clear after animation
    });

    s.on('server:winner', (payload: { winnerId: string; movesHistory: any[] }) => {
      soundPlayRef.current('victory');
    });

    s.on('server:error', (payload: { message: string }) => {
      setErrorMsg(payload.message);
      // Reset optimistic hand on rejection
      setOptimisticHand(null);
      setTimeout(() => setErrorMsg(null), 4000);
    });

    s.connect();

    return () => {
      s.disconnect();
    };
  }, []);

  // Join Room Action
  const joinRoom = useCallback((code: string, username: string, avatarId: string, spec: boolean) => {
    if (!socket) return;
    socket.emit('client:joinRoom', { roomCode: code, username, avatarId, isSpectator: spec }, (response: any) => {
      if (response.success) {
        setRoomCode(code);
        setProfile(response.profile);
        setIsSpectator(spec);
        sessionStorage.setItem('uno_session', JSON.stringify({
          roomCode: code,
          reconnectToken: response.reconnectToken || null,
          playerId: response.profile.id,
          isSpectator: spec,
          username,
          avatarId
        }));
      } else {
        setErrorMsg(response.error || 'Failed to join room.');
      }
    });
  }, [socket]);

  // Create Room Action
  const createRoom = useCallback(
    (username: string, avatarId: string, settings: RoomSettings) => {
      if (!socket) return;

      socket.emit("client:createRoom", { username, avatarId, settings }, (response: any) => {
        if (response.success) {
          setRoomCode(response.roomCode);
          setProfile(response.profile);
          setIsSpectator(false);

          sessionStorage.setItem('uno_session', JSON.stringify({
            roomCode: response.roomCode,
            reconnectToken: response.reconnectToken,
            playerId: response.profile.id,
            isSpectator: false,
            username,
            avatarId
          }));
        } else {
          setErrorMsg(response.error || "Failed to create room.");
        }
      });
    },
    [socket]
  );

  // Update Settings Action
  const updateSettings = useCallback((settings: RoomSettings) => {
    if (!socket) return;
    socket.emit('client:updateSettings', settings);
  }, [socket]);

  // Toggle Ready State
  const setReady = useCallback((isReady: boolean) => {
    if (!socket) return;
    socket.emit('client:ready', { isReady });
  }, [socket]);

  // Start Game State
  const startGame = useCallback(() => {

    if (!socket) {
      return;
    }
    socket.emit("client:startGame");

  }, [socket]);

  // Play Card (Optimistic UI implementation)
  const playCard = useCallback((cardId: string, chosenColor?: CardColor) => {
    if (!socket || !gameState) return;

    // Trigger optimistic UI transition: filter card out immediately
    const nextHand = (optimisticHand || gameState.myHand).filter((c) => c.id !== cardId);
    setOptimisticHand(nextHand);

    socket.emit('client:playCard', {
      cardId,
      chosenColor,
      expectedStateVersion: gameState.stateVersion,
    });
  }, [socket, gameState, optimisticHand]);

  // Draw Card Action
  const drawCard = useCallback(() => {
    if (!socket || !gameState) return;
    onSoundPlay('draw');
    socket.emit('client:drawCard', { expectedStateVersion: gameState.stateVersion });
  }, [socket, gameState, onSoundPlay]);

  // Pass Turn Action
  const passTurn = useCallback(() => {
    if (!socket || !gameState) return;
    socket.emit('client:passTurn', { expectedStateVersion: gameState.stateVersion });
  }, [socket, gameState]);

  // Select Starting Color
  const selectStartingColor = useCallback((chosenColor: CardColor) => {
    if (!socket || !gameState) return;
    socket.emit('client:selectStartingColor', { chosenColor, expectedStateVersion: gameState.stateVersion });
  }, [socket, gameState]);

  // Call UNO Action
  const callUno = useCallback(() => {
    if (!socket) return;
    socket.emit('client:uno');
  }, [socket]);

  // Catch UNO Call out Action
  const catchUno = useCallback((targetPlayerId: string) => {
    if (!socket) return;
    socket.emit('client:catchUno', { targetPlayerId });
  }, [socket]);

  // WD4 Challenge Response Action
  const sendChallenge = useCallback((shouldChallenge: boolean) => {
    if (!socket || !gameState) return;
    socket.emit('client:challenge', { shouldChallenge, expectedStateVersion: gameState.stateVersion });
  }, [socket, gameState]);

  // Chat message send
  const sendChat = useCallback((message: string) => {
    if (!socket) return;
    socket.emit('client:chat', { message });
  }, [socket]);

  // Floating Emoji reaction send
  const sendEmoji = useCallback((emojiCode: string) => {
    if (!socket) return;
    socket.emit('client:emoji', { emojiCode });
  }, [socket]);

  // Token auto-reconnection trigger
  const tryReconnect = useCallback((session: { roomCode: string; reconnectToken: string | null; playerId: string; isSpectator: boolean; username: string; avatarId: string }) => {
    if (!socket) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      socket.emit('client:reconnect', {
        reconnectToken: session.reconnectToken,
        roomCode: session.roomCode,
        playerId: session.playerId,
        username: session.username,
        avatarId: session.avatarId,
        isSpectator: session.isSpectator
      }, (response: any) => {
        if (response.success) {
          setRoomCode(session.roomCode);
          setProfile({ id: session.playerId, username: session.username, avatarId: session.avatarId });
          setIsSpectator(session.isSpectator);
          resolve(true);
        } else {
          sessionStorage.removeItem('uno_session');
          setErrorMsg('Reconnection expired or failed.');
          resolve(false);
        }
      });
    });
  }, [socket]);

  const playAgain = useCallback(() => {
    if (!socket) return;
    socket.emit('client:playAgain');
  }, [socket]);

  const returnLobby = useCallback(() => {
    if (!socket) return;
    socket.emit('client:returnLobby');
  }, [socket]);

  const selectSwapTarget = useCallback((targetPlayerId: string) => {
    if (!socket || !gameState) return;
    socket.emit('client:selectSwapTarget', { targetPlayerId, expectedStateVersion: gameState.stateVersion });
  }, [socket, gameState]);

  const selectRouletteColor = useCallback((chosenColor: CardColor) => {
    if (!socket || !gameState) return;
    socket.emit('client:selectRouletteColor', { chosenColor, expectedStateVersion: gameState.stateVersion });
  }, [socket, gameState]);

  return {
    socket,
    roomCode,
    profile,
    gameState,
    spectatorState,
    isSpectator,
    lobbyPlayers,
    chatMessages,
    activeEmoji,
    errorMsg,
    localHand: optimisticHand || (gameState ? gameState.myHand : []),
    createRoom,
    updateSettings,
    joinRoom,
    setReady,
    startGame,
    playCard,
    drawCard,
    passTurn,
    selectStartingColor,
    callUno,
    catchUno,
    sendChallenge,
    sendChat,
    sendEmoji,
    tryReconnect,
    playAgain,
    returnLobby,
    selectSwapTarget,
    selectRouletteColor,
  };
}
