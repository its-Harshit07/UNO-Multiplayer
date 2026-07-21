import React, { useState, useEffect } from 'react';
import { useGameSocket } from './hooks/useGameSocket';
import { useAudio } from './hooks/useAudio';
import { LobbyRoom } from './components/LobbyRoom';
import { GameBoard } from './components/GameBoard';
import { Leaderboard } from './components/Leaderboard';
import { PlayerGameState, GameVariant } from '../../shared/src/types';

function App() {
  const { playSound, muted, setMuted, volume, setVolume } = useAudio();

  const {
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
    localHand,
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
  } = useGameSocket(playSound);

  const avatarId = 'avatar1';
  const [username, setUsername] = useState(() => localStorage.getItem('uno_username') || '');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [viewState, setViewState] = useState<'LANDING' | 'LOBBY' | 'GAME' | 'LEADERBOARD'>('LANDING');

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('uno_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('uno_theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const [maxPlayers, setMaxPlayers] = useState(10);
  const [turnTimerLimit, setTurnTimerLimit] = useState(30);
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [enableBots, setEnableBots] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [gameVariant, setGameVariant] = useState<GameVariant>('CLASSIC');

  const [route, setRoute] = useState<'LANDING' | 'HOST_CONFIG' | 'JOIN' | 'GAME'>(() => {
    if (typeof window === 'undefined') return 'LANDING';
    const path = window.location.pathname;
    if (path === '/join') return 'JOIN';
    if (path === '/config') return 'HOST_CONFIG';
    if (path === '/game') return 'GAME';
    return 'LANDING';
  });

  const [reconnecting, setReconnecting] = useState(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('uno_session') !== null;
  });

  // Pre-fill Room Code from URL on load
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/join\/([0-9a-zA-Z]+)/);
    if (match && match[1]) {
      const code = match[1];
      setInputRoomCode(code);
      window.history.replaceState({}, '', `/join?room=${code}`);
      setRoute('JOIN');
    } else {
      const searchParams = new URLSearchParams(window.location.search);
      const roomQuery = searchParams.get('room');
      if (roomQuery) {
        setInputRoomCode(roomQuery);
        setRoute('JOIN');
      }
    }
  }, []);

  // Handle route navigation reactively based on roomCode and reconnecting status
  useEffect(() => {
    if (roomCode) {
      if (window.location.pathname !== '/game') {
        window.history.replaceState({}, '', '/game');
        setRoute('GAME');
      }
    } else if (!reconnecting && route === 'GAME') {
      window.history.replaceState({}, '', '/');
      setRoute('LANDING');
    }
  }, [roomCode, reconnecting, route]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/config') {
        setRoute('HOST_CONFIG');
      } else if (path === '/join') {
        setRoute('JOIN');
        const searchParams = new URLSearchParams(window.location.search);
        const roomQuery = searchParams.get('room');
        if (roomQuery) {
          setInputRoomCode(roomQuery);
        }
      } else if (path === '/game') {
        if (!sessionStorage.getItem('uno_session')) {
          window.history.replaceState({}, '', '/');
          setRoute('LANDING');
        } else {
          setRoute('GAME');
        }
      } else {
        setRoute('LANDING');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newRoute: 'LANDING' | 'HOST_CONFIG' | 'JOIN' | 'GAME', extraCode?: string) => {
    let path = '/';
    if (newRoute === 'HOST_CONFIG') path = '/config';
    else if (newRoute === 'JOIN') path = extraCode ? `/join?room=${extraCode}` : '/join';
    else if (newRoute === 'GAME') path = '/game';

    if (newRoute === 'GAME') {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    setRoute(newRoute);
  };

  useEffect(() => {
    if (username) {
      localStorage.setItem('uno_username', username);
    }
  }, [username]);

  // Sync state machine views
  useEffect(() => {
    if (!roomCode) {
      setViewState('LANDING');
    } else if (
      gameState?.gameStatus === 'PLAYING' ||
      gameState?.gameStatus === 'CHALLENGE_WINDOW' ||
      gameState?.gameStatus === 'SCORING' ||
      spectatorState?.gameStatus === 'PLAYING' ||
      spectatorState?.gameStatus === 'CHALLENGE_WINDOW' ||
      spectatorState?.gameStatus === 'SCORING'
    ) {
      setViewState('GAME');
    } else if (
      gameState?.gameStatus === 'GAME_OVER' ||
      spectatorState?.gameStatus === 'GAME_OVER'
    ) {
      setViewState('LEADERBOARD');
    } else {
      setViewState('LOBBY');
    }
  }, [roomCode, gameState, spectatorState]);

  // Attempt auto-reconnect on load using saved session
  useEffect(() => {
    const rawSession = sessionStorage.getItem('uno_session');
    if (rawSession && socket) {
      const attemptReconnect = async () => {
        try {
          const session = JSON.parse(rawSession);
          if (session.settings) {
            setMaxPlayers(session.settings.maxPlayers);
            setTurnTimerLimit(session.settings.turnTimerLimit);
            setAllowSpectators(session.settings.allowSpectators);
            setEnableBots(session.settings.enableBots);
            setBotDifficulty(session.settings.botDifficulty);
            setGameVariant(session.settings.gameVariant || 'CLASSIC');
          }
          const success = await tryReconnect(session);
          if (!success) {
            // Remove code parameters if any
            const url = new URL(window.location.href);
            url.searchParams.delete('room');
            window.history.replaceState({}, '', url.toString());
          }
        } catch (e) {
          sessionStorage.removeItem('uno_session');
        } finally {
          setReconnecting(false);
        }
      };

      if (socket.connected) {
        attemptReconnect();
      } else {
        socket.once('connect', attemptReconnect);
      }
    } else {
      setReconnecting(false);
    }
  }, [socket, tryReconnect]);


  const handleCreateRoom = () => {
    if (!username.trim()) {
      alert('Please enter a username.');
      return;
    }
    // Sound check
    playSound('shuffle');

    createRoom(username, avatarId, {
      maxPlayers,
      isPublic: true,
      turnTimerLimit,
      allowSpectators,
      enableBots,
      botDifficulty,
      spectatorDelaySec: 3,
      unoTimeoutSec: 2,
      gameVariant,
      houseRules: {
        stackDrawTwo: false,
        stackDrawFour: false,
        sevenZeroRule: false,
        jumpIn: false,
        forcePlay: false,
        progressiveDraw: false,
      },
    });
  };

  const handleJoinRoom = () => {
    if (!username.trim()) {
      alert('Please enter a username.');
      return;
    }
    if (inputRoomCode.length !== 7) {
      alert('Enter a valid 7-digit join code.');
      return;
    }
    playSound('shuffle');
    joinRoom(inputRoomCode, username, avatarId, joinAsSpectator);
  };

  const handleCancelRoom = () => {
    if (window.confirm('Are you sure you want to cancel this room? All players will be kicked.')) {
      sessionStorage.removeItem('uno_session');
      socket?.disconnect();
      setRoute('LANDING');
      window.location.href = '/';
    }
  };

  return (
    <div className={`app-container ${theme}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Top Header Bar */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 30px', borderBottom: '1px solid var(--border-glass)',
        background: 'var(--bg-glass)', backdropFilter: 'blur(16px)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-red)' }}>U</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-yellow)' }}>N</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-green)' }}>O</span>
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text)', opacity: 0.6, marginLeft: '8px' }}>Online</span>
        </div>

        {/* Audio Mute & Volume indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Theme switcher */}
          <button
            onClick={toggleTheme}
            className="glass-button"
            style={{
              width: '36px', height: '36px', padding: 0,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', border: '1px solid var(--border-glass)'
            }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <span style={{
              fontSize: '1.2rem',
              transition: 'transform 0.5s ease',
              transform: theme === 'dark' ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block'
            }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </span>
          </button>

          <button
            onClick={() => setMuted(!muted)}
            className="glass-button"
            style={{
              padding: '6px 16px', fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>{muted ? '🔇' : '🔊'}</span>
            <span>{muted ? 'Muted' : 'Sound On'}</span>
          </button>
          {!muted && (
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={{ width: '80px', height: '4px', cursor: 'pointer' }}
            />
          )}
        </div>
      </header>

      {/* Error alert toast */}
      {errorMsg && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(230,57,70,0.9)', border: '1px solid #ff3333',
          padding: '12px 24px', borderRadius: '8px', zIndex: 200, color: '#fff',
          boxShadow: '0 4px 15px rgba(255,51,51,0.3)', fontWeight: 600, fontSize: '0.9rem'
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main View Manager */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {reconnecting ? (
          <div className="glass-panel animate-pulse" style={{ padding: '40px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: '3rem', animation: 'spin-cw 2s infinite linear' }}>🔌</span>
            <h2 style={{ color: 'var(--color-yellow)', fontWeight: 800, fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Restoring Session</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Connecting back to your game room...</p>
          </div>
        ) : (
          <>
            {route === 'LANDING' && (
              <div className="glass-panel" style={{
                width: '420px', padding: '40px 30px', display: 'flex', flexDirection: 'column',
                gap: '24px', margin: '20px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text)' }}>
                    Welcome to UNO!
                  </h1>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
                    Join a room to play official classic UNO with players or bots.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Nickname</label>
                    <input
                      type="text"
                      placeholder="Enter nickname..."
                      value={username}
                      onChange={(e) => setUsername(e.target.value.slice(0, 16))}
                      style={{
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                        borderRadius: '8px', color: 'var(--color-text)', padding: '12px', fontSize: '0.95rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
                    <button
                      className="primary-button"
                      onClick={() => {
                        if (!username.trim()) {
                          alert('Please enter a username.');
                          return;
                        }
                        navigateTo('HOST_CONFIG');
                      }}
                      style={{ padding: '14px', fontSize: '1rem' }}
                    >
                      Create Room
                    </button>

                    <button
                      className="glass-button"
                      onClick={() => {
                        navigateTo('JOIN');
                      }}
                      style={{ padding: '12px', fontSize: '0.95rem' }}
                    >
                      Join Room
                    </button>
                  </div>
                </div>
              </div>
            )}

            {route === 'HOST_CONFIG' && (
              <div className="glass-panel" style={{
                width: '420px', padding: '40px 30px', display: 'flex', flexDirection: 'column',
                gap: '24px', margin: '20px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-text)' }}>
                    Room Config
                  </h1>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
                    Configure rules and participants for your new UNO match.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {/* Room and Bot Settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Game Variant</label>
                      <select
                        value={gameVariant}
                        onChange={(e) => setGameVariant(e.target.value as GameVariant)}
                        style={{
                          background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                          borderRadius: '8px', color: 'var(--color-text)', padding: '10px', fontSize: '0.9rem',
                          outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="CLASSIC">Classic UNO</option>
                        <option value="FLIP">UNO Flip</option>
                        <option value="MERCY">UNO Show'em No Mercy</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Max Players</label>
                        <select
                          value={maxPlayers}
                          onChange={(e) => setMaxPlayers(Number(e.target.value))}
                          style={{
                            background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                            borderRadius: '8px', color: 'var(--color-text)', padding: '10px', fontSize: '0.9rem',
                            outline: 'none', cursor: 'pointer'
                          }}
                        >
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n} Players</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Turn Timer</label>
                        <select
                          value={turnTimerLimit}
                          onChange={(e) => setTurnTimerLimit(Number(e.target.value))}
                          style={{
                            background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                            borderRadius: '8px', color: 'var(--color-text)', padding: '10px', fontSize: '0.9rem',
                            outline: 'none', cursor: 'pointer'
                          }}
                        >
                          {[10, 15, 20, 30, 45, 60].map(s => (
                            <option key={s} value={s}>{s} seconds</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>Allow Spectators</span>
                      <input
                        type="checkbox"
                        checked={allowSpectators}
                        onChange={(e) => setAllowSpectators(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>Enable Bot Players</span>
                      <input
                        type="checkbox"
                        checked={enableBots}
                        onChange={(e) => setEnableBots(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>

                    {enableBots && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', animation: 'slide-down-fade-in 0.2s ease forwards' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Bot Difficulty</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
                            <button
                              key={diff}
                              type="button"
                              onClick={() => setBotDifficulty(diff)}
                              style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: 'none',
                                background: botDifficulty === diff ? 'var(--color-blue)' : 'var(--input-bg)',
                                color: botDifficulty === diff ? '#fff' : 'var(--color-text)',
                                transition: 'all 0.2s',
                              }}
                            >
                              {diff}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                    <button
                      className="primary-button"
                      onClick={handleCreateRoom}
                      style={{ background: 'linear-gradient(135deg, var(--color-green), #15803d)', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(22, 163, 74, 0.25)' }}
                    >
                      Confirm & Create Room
                    </button>

                    <button
                      className="glass-button"
                      onClick={() => navigateTo('LANDING')}
                      style={{ padding: '12px', fontSize: '0.95rem' }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )}

            {route === 'JOIN' && (
              <div className="glass-panel" style={{
                width: '420px', padding: '40px 30px', display: 'flex', flexDirection: 'column',
                gap: '24px', margin: '20px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text)' }}>
                    Join a Room
                  </h1>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
                    Enter the room code shared by the host to join their game.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Nickname</label>
                    <input
                      type="text"
                      placeholder="Enter nickname..."
                      value={username}
                      onChange={(e) => setUsername(e.target.value.slice(0, 16))}
                      style={{
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                        borderRadius: '8px', color: 'var(--color-text)', padding: '12px', fontSize: '0.95rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Room Code</label>
                    <input
                      type="text"
                      maxLength={7}
                      placeholder="Enter 7-digit Room Code"
                      value={inputRoomCode}
                      onChange={(e) => setInputRoomCode(e.target.value.replace(/\D/g, ''))}
                      style={{
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                        borderRadius: '8px', color: 'var(--color-text)', padding: '12px', fontSize: '0.95rem',
                        textAlign: 'center', letterSpacing: '2px', outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                    <input
                      type="checkbox"
                      id="spec"
                      checked={joinAsSpectator}
                      onChange={(e) => setJoinAsSpectator(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="spec" style={{ fontSize: '0.8rem', color: 'var(--color-text)', cursor: 'pointer' }}>
                      Join as Spectator (Delayed feed)
                    </label>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                    <button className="primary-button" onClick={handleJoinRoom} style={{ padding: '14px', fontSize: '1rem' }}>
                      Join Match
                    </button>

                    <button className="glass-button" onClick={() => navigateTo('LANDING')} style={{ padding: '12px', fontSize: '0.95rem' }}>
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )}

            {route === 'GAME' && (
              <>
                {viewState === 'LOBBY' && roomCode && (
                  <LobbyRoom
                    roomCode={roomCode}
                    hostId={lobbyPlayers[0]?.id || ''}
                    myId={profile?.id || ''}
                    players={lobbyPlayers}
                    isSpectator={isSpectator}
                    maxPlayers={maxPlayers}
                    turnTimer={turnTimerLimit}
                    botsEnabled={enableBots}
                    botDifficulty={botDifficulty}
                    allowSpectators={allowSpectators}
                    onCancelRoom={handleCancelRoom}
                    onStartGame={() => {
                      startGame();
                    }}
                    onToggleReady={setReady}
                    gameVariant={gameVariant}
                  />
                )}

                {viewState === 'GAME' && (gameState || spectatorState) && (
                  <GameBoard
                    theme={theme}
                    gameState={gameState || (spectatorState as any)}
                    myId={profile?.id || ''}
                    localHand={localHand}
                    chatMessages={chatMessages}
                    activeEmoji={activeEmoji}
                    onPlayCard={playCard}
                    onDrawCard={drawCard}
                    onPassTurn={passTurn}
                    onSelectStartingColor={selectStartingColor}
                    onCallUno={callUno}
                    onCatchUno={catchUno}
                    onSendChallenge={sendChallenge}
                    onSendMessage={sendChat}
                    onSendEmoji={sendEmoji}
                    onReturnLobby={returnLobby}
                    onSelectSwapTarget={selectSwapTarget}
                    onSelectRouletteColor={selectRouletteColor}
                  />
                )}

                {viewState === 'LEADERBOARD' && (gameState || spectatorState) && (
                  <Leaderboard
                    winnerId={gameState ? gameState.winnerId || '' : spectatorState?.winnerId || ''}
                    players={gameState ? gameState.players : spectatorState?.players || []}
                    matchDuration={gameState ? gameState.matchDuration : spectatorState?.matchDuration || null}
                    totalMoves={gameState ? gameState.totalMoves : spectatorState?.totalMoves || 0}
                    mostUsedColor={gameState ? gameState.mostUsedColor : spectatorState?.mostUsedColor || null}
                    matchStatistics={gameState ? gameState.matchStatistics : spectatorState?.matchStatistics || null}
                    isHost={gameState ? profile?.id === gameState.hostId : spectatorState ? profile?.id === spectatorState.hostId : false}
                    onPlayAgain={playAgain}
                    onReturnLobby={returnLobby}
                    eliminatedPlayers={gameState ? gameState.eliminatedPlayers : spectatorState?.eliminatedPlayers || []}
                    gameVariant={gameState ? gameState.gameVariant : spectatorState?.gameVariant || 'CLASSIC'}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
