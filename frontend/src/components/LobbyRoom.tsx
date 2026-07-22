import React, { useState } from 'react';
import { RoomSettings, GameVariant } from '../../../shared/src/types';


interface LobbyRoomProps {
  roomCode: string;
  hostId: string;
  myId: string;
  players: { id: string; username: string; avatarId: string; isReady: boolean }[];
  isSpectator: boolean;
  onStartGame: () => void;
  onToggleReady: (ready: boolean) => void;
  maxPlayers: number;
  turnTimer: number;
  botsEnabled: boolean;
  botDifficulty: 'EASY' | 'MEDIUM' | 'HARD';
  allowSpectators: boolean;
  onCancelRoom: () => void;
  gameVariant?: GameVariant;
}

export const LobbyRoom = ({
  roomCode,
  hostId,
  myId,
  players,
  isSpectator,
  onStartGame,
  onToggleReady,
  maxPlayers,
  turnTimer,
  botsEnabled,
  botDifficulty,
  allowSpectators,
  onCancelRoom,
  gameVariant = 'CLASSIC',
}: LobbyRoomProps) => {
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const isHost = hostId === myId;

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/join?room=${roomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleReady = () => {
    const next = !isReady;
    setIsReady(next);
    onToggleReady(next);
  };

  const allPlayersReady = players.length >= 2 && players.every((p: any) => p.id === hostId || p.isReady);

  return (
    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', padding: '20px', width: '100%', boxSizing: 'border-box' }}>

      {/* Lobby info and Players */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '24px', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Room Join Code
          </span>
          <h2 style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--color-yellow)', textShadow: '0 2px 8px rgba(0,0,0,0.05)', margin: '10px 0' }}>
            {roomCode}
          </h2>
          <button className="glass-button" onClick={handleCopyLink} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            {copied ? '✓ Link Copied!' : '📋 Copy Invite Link'}
          </button>
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px', marginBottom: '15px' }}>
            Players ({players.length}/{maxPlayers})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {players.map((p: any) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                borderRadius: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', background: p.isBot ? 'rgba(22, 163, 74, 0.1)' : 'var(--input-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
                    border: p.isBot ? '1px solid var(--color-green)' : 'none', flexShrink: 0
                  }}>
                    {p.isBot ? '🤖' : '👤'}
                  </div>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px', display: 'inline-block' }} title={p.username}>{p.username}</span>
                    {p.isBot && <span style={{ fontSize: '0.75rem', background: 'var(--color-green)', color: '#fff', fontWeight: 800, padding: '2px 6px', borderRadius: '10px' }}>BOT</span>}
                    {p.id === hostId && <span style={{ fontSize: '0.75rem', background: 'var(--color-blue)', color: '#fff', padding: '2px 6px', borderRadius: '10px' }}>Host</span>}
                  </div>
                </div>
                <div>
                  {p.isBot ? (
                    <span style={{ color: 'var(--color-green)', fontSize: '0.85rem', fontWeight: 850 }}>✓ READY</span>
                  ) : p.id === hostId ? (
                    <span style={{ color: 'var(--color-blue)', fontSize: '0.85rem', fontWeight: 700 }}>Orchestrating</span>
                  ) : (
                    <span style={{
                      color: p.isReady ? 'var(--color-green)' : 'var(--color-text-muted)',
                      fontSize: '0.85rem', fontWeight: 700
                    }}>
                      {p.isReady ? '✓ READY' : '⏳ WAITING'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          {isSpectator ? (
            <div style={{
              textAlign: 'center',
              padding: '15px',
              color: 'var(--color-yellow)',
              fontWeight: 800,
              background: 'rgba(217, 119, 6, 0.1)',
              borderRadius: '12px',
              border: '1px solid rgba(217, 119, 6, 0.2)',
              flex: 1,
              fontSize: '1.1rem'
            }}>
              👁️ Spectating: Waiting for host to start game...
            </div>
          ) : isHost ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              <button
                className={allPlayersReady ? 'green-button' : 'glass-button'}
                disabled={!allPlayersReady}
                onClick={onStartGame}
                style={{
                  width: '100%', padding: '15px', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 800,
                  cursor: allPlayersReady ? 'pointer' : 'not-allowed',
                  boxShadow: allPlayersReady ? '0 4px 14px rgba(22, 163, 74, 0.25)' : 'none',
                }}
              >
                Start Game
              </button>
              <button
                className="red-button"
                onClick={onCancelRoom}
                style={{
                  width: '100%', padding: '15px', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(225, 29, 72, 0.25)'
                }}
              >
                Cancel Room
              </button>
            </div>
          ) : (
            <button
              className={isReady ? 'green-button' : 'glass-button'}
              onClick={handleToggleReady}
              style={{
                flex: 1, padding: '15px', borderRadius: '12px',
                fontSize: '1.1rem', fontWeight: 800,
                boxShadow: isReady ? '0 4px 14px rgba(22, 163, 74, 0.25)' : 'none',
              }}
            >
              {isReady ? 'I am Ready!' : 'Mark Ready'}
            </button>
          )}
        </div>
      </div>

      {/* Lobby Room Config Settings Summary (Host Only) */}
      {isHost && (
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
            Room Settings Summary
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Game Variant:</span>
              <span style={{ fontWeight: 700, color: 'var(--color-yellow)' }}>
                {gameVariant === 'FLIP' ? 'UNO Flip' : gameVariant === 'MERCY' ? "Show'em No Mercy" : 'Classic UNO'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Max Players:</span>
              <span style={{ fontWeight: 700 }}>{maxPlayers} Players</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Turn Timer:</span>
              <span style={{ fontWeight: 700 }}>{turnTimer > 0 ? `${turnTimer} Seconds` : 'No Timer'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Bot Autoplay:</span>
              <span style={{ fontWeight: 700, color: botsEnabled ? 'var(--color-green)' : 'inherit' }}>
                {botsEnabled ? `Enabled (${botDifficulty})` : 'Disabled'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Spectators:</span>
              <span style={{ fontWeight: 700 }}>{allowSpectators ? 'Allowed' : 'Disabled'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
