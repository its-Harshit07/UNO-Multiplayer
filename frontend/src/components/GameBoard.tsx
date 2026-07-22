import React, { useState, useEffect, useRef } from 'react';
import { PlayerGameState, Card as CardType, CardColor, GameVariant } from '../../../shared/src/types';

import { Card } from './Card/Card';
import { ChatPanel } from './ChatPanel';

function translateMoveToText(move: any): string {
  const name = move.playerName;
  if (move.action === 'PLAY') {
    if (move.card) {
      const formattedCard = move.card
        .split('_')
        .map((w: string) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ');
      return `${name} played ${formattedCard}`;
    }
    if (move.color) {
      if (move.color.startsWith('Starts color:')) {
        const col = move.color.replace('Starts color: ', '');
        return `${col.charAt(0) + col.slice(1).toLowerCase()} selected`;
      }
      const col = move.color;
      const emojiMap: Record<string, string> = {
        RED: '🔴 RED',
        YELLOW: '🟡 YELLOW',
        GREEN: '🟢 GREEN',
        BLUE: '🔵 BLUE',
        PINK: '💗 PINK',
        TEAL: '💎 TEAL',
        ORANGE: '🍊 ORANGE',
        PURPLE: '🔮 PURPLE',
      };
      const formattedColor = emojiMap[col] || col;
      return `${name} selected ${formattedColor}`;
    }
    return `${name} played a card`;
  }
  if (move.action === 'DRAW') {
    if (move.color && move.color.startsWith('drew')) {
      return `${name} ${move.color}`;
    }
    if (move.color === 'drew 2 cards') return `${name} drew 2 cards`;
    if (move.color === 'drew 4 cards') return `${name} drew 4 cards`;
    if (move.color === 'drew 6 cards') return `${name} drew 6 cards`;
    return `${name} drew a card`;
  }
  if (move.action === 'PASS') {
    if (move.color === 'Turn skipped (Timeout)') {
      return `${name} timed out`;
    }
    return `${name} passed`;
  }
  if (move.action === 'UNO') {
    if (move.color && move.color.startsWith('Caught')) {
      return move.color;
    }
    return `${name} called UNO!`;
  }
  if (move.action === 'CHALLENGE') {
    return `${name} challenged +4`;
  }
  if (move.action === 'CHALLENGE_RESOLVED') {
    if (move.color === 'Challenge successful') return 'Challenge successful';
    if (move.color === 'Challenge failed') return 'Challenge failed';
    return move.color || '';
  }
  return '';
}

const ActionFeed = ({ movesHistory }: { movesHistory: any[] }) => {
  const [notifications, setNotifications] = useState<{ id: number; text: string }[]>([]);
  const prevHistoryLen = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    if (!movesHistory) return;

    if (movesHistory.length > prevHistoryLen.current) {
      const newMoves = movesHistory.slice(prevHistoryLen.current);

      newMoves.forEach((move) => {
        const text = translateMoveToText(move);
        if (text) {
          const id = nextId.current++;
          setNotifications((prev) => [...prev, { id, text }].slice(-5));

          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
          }, 3000);
        }
      });
    }
    prevHistoryLen.current = movesHistory.length;
  }, [movesHistory]);

  return (
    <div className="action-feed-container" style={{
      position: 'absolute',
      bottom: '120px',
      left: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 40,
      pointerEvents: 'none',
      width: '280px',
    }}>
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className="glass-panel"
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            background: 'var(--color-hud-bg)',
            borderLeft: '4px solid var(--color-yellow)',
            animation: 'slide-up-fade-in 0.3s ease forwards',
            boxShadow: 'var(--shadow-panel)',
            color: 'var(--color-text)',
          }}
        >
          {notif.text}
        </div>
      ))}
    </div>
  );
};

interface GameBoardProps {
  theme?: string;
  gameState: PlayerGameState;
  myId: string;
  localHand: CardType[];
  chatMessages: any[];
  activeEmoji: { playerId: string; emojiCode: string } | null;
  onPlayCard: (cardId: string, chosenColor?: CardColor) => void;
  onDrawCard: () => void;
  onPassTurn: () => void;
  onSelectStartingColor: (color: CardColor) => void;
  onCallUno: () => void;
  onCatchUno: (targetId: string) => void;
  onSendChallenge: (challenge: boolean) => void;
  onSendMessage: (msg: string) => void;
  onSendEmoji: (emoji: string) => void;
  onReturnLobby: () => void;
  onSelectSwapTarget: (targetPlayerId: string) => void;
  onSelectRouletteColor: (color: CardColor) => void;
}

export const GameBoard = ({
  theme,
  gameState,
  myId,
  localHand,
  chatMessages,
  activeEmoji,
  onPlayCard,
  onDrawCard,
  onPassTurn,
  onSelectStartingColor,
  onCallUno,
  onCatchUno,
  onSendChallenge,
  onSendMessage,
  onSendEmoji,
  onReturnLobby,
  onSelectSwapTarget,
  onSelectRouletteColor,
}: GameBoardProps) => {
  const { players, topDiscardCard, currentColor, direction, currentPlayerIndex, drawPileSize, pendingChallenge, waitingForStartingColor } = gameState;
  const [wildCardPendingId, setWildCardPendingId] = useState<string | null>(null);

  const isSpectator = !players.some((p: any) => p.id === myId);

  // Timeout notification state
  const [timeoutNotification, setTimeoutNotification] = useState<string | null>(null);
  const prevHistoryLen = useRef(0);

  const handRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isMobileHand, setIsMobileHand] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const prevHandLength = useRef(localHand.length);

  useEffect(() => {
    const el = handRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const el = handRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth);
      setIsMobileHand(window.innerWidth <= 768);
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);

    const observer = new MutationObserver(checkOverflow);
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', checkOverflow);
      observer.disconnect();
    };
  }, [localHand.length]);

  useEffect(() => {
    if (localHand.length > prevHandLength.current) {
      if (handRef.current) {
        setTimeout(() => {
          if (handRef.current) {
            handRef.current.scrollTo({
              left: handRef.current.scrollWidth,
              behavior: 'smooth'
            });
          }
        }, 100);
      }
    }
    prevHandLength.current = localHand.length;
  }, [localHand.length]);

  useEffect(() => {
    if (!gameState?.movesHistory) return;
    if (gameState.movesHistory.length > prevHistoryLen.current) {
      const lastMove = gameState.movesHistory[gameState.movesHistory.length - 1];
      if (lastMove.color === 'Turn skipped (Timeout)') {
        setTimeoutNotification(`${lastMove.playerName} took too long. Turn skipped.`);
        setTimeout(() => setTimeoutNotification(null), 2000);
      }
    }
    prevHistoryLen.current = gameState.movesHistory.length;
  }, [gameState?.movesHistory]);

  const activePlayer = players[currentPlayerIndex];
  const isMyTurn = activePlayer?.id === myId;
  const isActivePlayerMe = activePlayer?.id === myId;

  const isScoringPhase = gameState.gameStatus === 'SCORING';
  const isLocalPlayerEliminated = gameState.eliminatedPlayers?.includes(myId);

  const getPlayerScore = (id: string): number => {
    if (!gameState.matchStatistics) return 0;
    const stat = gameState.matchStatistics.find((s) => s.playerId === id);
    return stat ? stat.score : 0;
  };

  const getTimerColor = (seconds: number): string => {
    if (seconds >= 6) return 'var(--color-green)';
    if (seconds >= 3) return 'var(--color-yellow)';
    return 'var(--color-red)';
  };

  // Arrange opponents relative to the current player
  const myIndex = players.findIndex((p: any) => p.id === myId);
  const reorderedOpponents = [...players];
  if (myIndex !== -1) {
    const shifted = reorderedOpponents.splice(0, myIndex);
    reorderedOpponents.push(...shifted);
  }
  const [mySeat, ...opponentSeats] = reorderedOpponents;

  // Stacking/Draw value helpers
  const getDrawValue = (card: CardType): number => {
    switch (card.value) {
      case 'DRAW_TWO': return 2;
      case 'DRAW_FOUR':
      case 'WILD_REVERSE_DRAW_FOUR': return 4;
      case 'WILD_DRAW_SIX': return 6;
      case 'WILD_DRAW_TEN': return 10;
      default: return 0;
    }
  };

  const isCardPlayable = (card: CardType): boolean => {
    if (isScoringPhase) return false;
    if (!isMyTurn) return false;
    if (pendingChallenge) return false;
    if (waitingForStartingColor) return false;
    if (gameState.pendingSwapTarget || gameState.pendingRouletteColor) return false;

    // Stacking rules (No Mercy)
    if (gameState.gameVariant === 'MERCY' && gameState.stackedDrawTotal && gameState.stackedDrawTotal > 0) {
      const incomingDrawVal = getDrawValue(card);
      const currentDrawVal = getDrawValue(topDiscardCard);
      return incomingDrawVal > 0 && incomingDrawVal >= currentDrawVal;
    }

    // Side-aware rules (Flip)
    if (gameState.gameVariant === 'FLIP') {
      const activeSide = gameState.activeSide || 'LIGHT';
      const face = (activeSide === 'DARK' && card.darkFace) ? card.darkFace : { color: card.color, value: card.value };
      const discardFace = (activeSide === 'DARK' && topDiscardCard.darkFace) ? topDiscardCard.darkFace : { color: topDiscardCard.color, value: topDiscardCard.value };

      if (face.color === 'WILD') return true;
      if (face.color === currentColor) return true;
      if (face.value === discardFace.value) return true;
      return false;
    }

    // Normal rules (Classic)
    if (card.color === 'WILD') return true;
    if (card.color === currentColor) return true;
    if (card.value === topDiscardCard.value) return true;

    return false;
  };

  // Card click handler
  const handleCardClick = (card: CardType) => {
    if (!isMyTurn) return;
    if (!isCardPlayable(card)) return;

    // Check if it's a Wild (excluding Roulette which has next player choice)
    const activeSide = gameState.activeSide || 'LIGHT';
    const isDark = activeSide === 'DARK';
    const cardColor = isDark && card.darkFace ? card.darkFace.color : card.color;
    const cardValue = isDark && card.darkFace ? card.darkFace.value : card.value;

    if (cardColor === 'WILD' && cardValue !== 'WILD_COLOR_ROULETTE') {
      setWildCardPendingId(card.id);
    } else {
      onPlayCard(card.id);
    }
  };

  const handleSelectColor = (color: CardColor) => {
    if (wildCardPendingId) {
      onPlayCard(wildCardPendingId, color);
      setWildCardPendingId(null);
    } else if (waitingForStartingColor && isMyTurn) {
      onSelectStartingColor(color);
    }
  };

  // Target player has 1 card left and didn't call UNO
  const findVulnerablePlayer = () => {
    return players.find((p: any) => p.id !== myId && p.handSize === 1 && !gameState.eliminatedPlayers?.includes(p.id));
  };
  const vulnerablePlayer = findVulnerablePlayer();

  // Class selectors for Theme Compatibility
  const getContainerClassName = () => {
    if (gameState.gameVariant === 'FLIP') {
      return gameState.activeSide === 'DARK'
        ? 'gameplay-bg-flip-dark'
        : 'gameplay-bg-flip-light';
    }
    if (gameState.gameVariant === 'MERCY') {
      return 'gameplay-bg-mercy';
    }
    return 'gameplay-bg-classic';
  };

  const getTableClassName = () => {
    if (gameState.gameVariant === 'FLIP') {
      return gameState.activeSide === 'DARK'
        ? 'gameplay-table-flip-dark'
        : 'gameplay-table-flip-light';
    }
    if (gameState.gameVariant === 'MERCY') {
      return 'gameplay-table-mercy';
    }
    return 'gameplay-table-classic';
  };

  const colorMap: Record<CardColor, string> = {
    RED: 'var(--color-red)', YELLOW: 'var(--color-yellow)', GREEN: 'var(--color-green)', BLUE: 'var(--color-blue)',
    PINK: '#ff2d7a', TEAL: '#00d2c4', ORANGE: '#ff8a00', PURPLE: '#9d00ff', WILD: '#ffffff'
  };

  const colorGlowMap: Record<CardColor, string> = {
    RED: 'rgba(230, 57, 70, 0.4)', YELLOW: 'rgba(255, 186, 8, 0.4)', GREEN: 'rgba(51, 204, 51, 0.4)', BLUE: 'rgba(0, 150, 255, 0.4)',
    PINK: 'rgba(255, 45, 122, 0.4)', TEAL: 'rgba(0, 210, 196, 0.4)', ORANGE: 'rgba(255, 138, 0, 0.4)', PURPLE: 'rgba(157, 0, 255, 0.4)', WILD: 'rgba(255, 255, 255, 0.2)'
  };

  const getSpanForOpponents = (count: number): number => {
    if (count <= 1) return 0;
    const spans = [0, 80, 130, 170, 200, 220, 240, 255, 270]; // spans in degrees
    const deg = spans[Math.min(count - 1, spans.length - 1)];
    return (deg * Math.PI) / 180;
  };

  // Helper to place seats on a circle
  const getSeatPositionStyle = (index: number, total: number): React.CSSProperties => {
    if (total === 0) return {};
    const centerAngle = 1.5 * Math.PI; // 270 degrees (top center)
    const span = getSpanForOpponents(total);

    let angle = centerAngle;
    if (total > 1) {
      const startAngle = centerAngle - span / 2;
      const step = span / (total - 1);
      angle = startAngle + index * step;
    }

    const radiusX = 40; // percent
    const radiusY = 32; // percent

    const x = 50 + Math.cos(angle) * radiusX;
    const y = 45 + Math.sin(angle) * radiusY;

    return {
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className={`gameplay-container ${getContainerClassName()}`}>

      {/* Dedicated Header Strip */}
      <div className="gameboard-header" style={{
        width: '100%',
        height: '70px',
        borderBottom: '1px solid var(--border-glass)',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 100,
        boxSizing: 'border-box'
      }}>
        {/* Left: End Match Button */}
        <div className="gameboard-header-left" style={{ width: '150px', display: 'flex', justifyContent: 'flex-start' }}>
          {!isSpectator && myId === gameState.hostId && (
            <button
              onClick={() => {
                if (window.confirm('If you end this match all players will return to the lobby.')) {
                  onReturnLobby();
                }
              }}
              className="red-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                padding: '8px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(225, 29, 72, 0.15)',
              }}
            >
              <span>❌</span>
              <span>Stop Match</span>
            </button>
          )}
        </div>

        {/* Center: Turn Indicator & Variant Title */}
        <div className="gameboard-header-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '0.85rem', color: 'var(--color-text-muted)',
              textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800
            }}>
              {isScoringPhase ? 'ANALYTICS' : isActivePlayerMe ? 'STATUS' : 'CURRENT TURN'}:
            </span>
            <span style={{
              fontSize: '1.25rem', fontWeight: 900,
              color: isScoringPhase ? 'var(--color-yellow)' : isActivePlayerMe ? 'var(--color-turn-active)' : 'var(--color-text)',
            }}>
              {isScoringPhase ? 'SCORING REVEAL' : isLocalPlayerEliminated ? 'ELIMINATED' : isActivePlayerMe ? 'YOUR TURN' : activePlayer?.username}
            </span>
            {!isScoringPhase && !isLocalPlayerEliminated && (
              <span style={{
                marginLeft: '8px', padding: '4px 10px', borderRadius: '12px',
                fontSize: '0.95rem', fontWeight: 800, color: getTimerColor(gameState.remainingTime),
                background: 'var(--input-bg)', display: 'flex', alignItems: 'center', gap: '4px',
                border: '1px solid var(--input-border)',
              }}>
                ⏳ {gameState.remainingTime}s
              </span>
            )}
          </div>
          {/* Variant Title */}
          <div style={{
            fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-yellow)',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            padding: '2px 8px', borderRadius: '8px'
          }}>
            {gameState.gameVariant === 'FLIP' ? `UNO FLIP (${gameState.activeSide} SIDE)` : gameState.gameVariant === 'MERCY' ? "UNO SHOW'EM NO MERCY" : 'CLASSIC UNO'}
          </div>
        </div>

        {/* Right: Spectator Count */}
        <div className="gameboard-header-right" style={{ width: '150px', display: 'flex', justifyContent: 'flex-end' }}>
          <div
            title="Current Spectators"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--color-spectator-bg)', padding: '6px 12px',
              borderRadius: '20px', border: '1px solid var(--color-spectator-border)',
              fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)',
            }}
          >
            <span>👁</span>
            <span>{gameState.spectatorCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Player Ribbon immediately below the header */}
      <div className="player-ribbon" style={{
        width: '100%',
        height: '82px',
        borderBottom: '1px solid var(--border-glass)',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '6px 12px',
        boxSizing: 'border-box',
        zIndex: 90,
        overflowX: 'auto',
      }}>
        {players.map((p: any, idx: number) => {
          const isCurrentTurn = idx === currentPlayerIndex;
          const isMe = p.id === myId;
          const isPlayerEliminated = gameState.eliminatedPlayers?.includes(p.id);

          // Dynamic styles based on total player count (reduced by ~15-20%)
          const count = players.length;
          const cardWidth = count >= 8 ? '74px' : count >= 5 ? '100px' : '125px';
          const cardPadding = count >= 8 ? '4px 2px' : count >= 5 ? '6px' : '8px';
          const avatarSize = count >= 8 ? '22px' : count >= 5 ? '28px' : '32px';
          const avatarFontSize = count >= 8 ? '0.85rem' : count >= 5 ? '0.95rem' : '1.1rem';
          const nameMaxWidth = count >= 8 ? '64px' : count >= 5 ? '80px' : '92px';
          const cardGap = count >= 8 ? '2px' : '4px';

          // Current turn highlights
          const turnClass = isCurrentTurn && !isPlayerEliminated ? 'active-turn-card' : '';

          return (
            <div
              key={p.id}
              className={`glass-panel player-ribbon-card ${turnClass}`}
              style={{
                flex: '0 1 auto',
                width: cardWidth,
                padding: cardPadding,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: cardGap,
                border: isCurrentTurn && !isPlayerEliminated ? '2px solid var(--color-blue)' : '1px solid var(--border-glass)',
                boxShadow: isCurrentTurn && !isPlayerEliminated ? '0 0 15px rgba(37, 99, 235, 0.25)' : 'none',
                opacity: isPlayerEliminated ? 0.35 : 1,
                transition: 'all 0.3s ease',
                position: 'relative',
              }}
            >
              {/* Turn indicator tiny dot */}
              {isCurrentTurn && !isPlayerEliminated && (
                <div style={{
                  position: 'absolute',
                  top: '6px',
                  left: '6px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-blue)',
                  boxShadow: '0 0 6px var(--color-blue)'
                }} />
              )}

              {/* Avatar */}
              <div style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: '50%',
                background: isMe ? 'rgba(37, 99, 235, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: avatarFontSize
              }}>
                {isPlayerEliminated ? '☠️' : p.isBot ? '🤖' : '👤'}
              </div>

              {/* Username */}
              <span style={{
                fontSize: count >= 8 ? '0.62rem' : '0.72rem',
                fontWeight: isMe ? 800 : 700,
                color: isMe ? 'var(--color-blue)' : 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: nameMaxWidth,
                whiteSpace: 'nowrap',
                textDecoration: isPlayerEliminated ? 'line-through' : 'none'
              }}>
                {isMe ? 'You' : p.username}
              </span>

              {/* Card count / Points */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: count >= 8 ? '0.68rem' : '0.78rem' }}>
                {isPlayerEliminated ? (
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-red)' }}>OUT</span>
                ) : (
                  <>
                    <span>🎴</span>
                    <span style={{ fontWeight: 800, color: 'var(--color-yellow)' }}>
                      {isMe ? localHand.length : p.handSize}
                    </span>
                  </>
                )}
              </div>

              {/* Points badge in scoring phase */}
              {isScoringPhase && getPlayerScore(p.id) > 0 && (
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-yellow)',
                  fontWeight: 800,
                  background: 'rgba(0,0,0,0.05)',
                  padding: '1px 5px',
                  borderRadius: '6px',
                }}>
                  Pts: {getPlayerScore(p.id)}
                </div>
              )}

              {/* UNO badge */}
              {(isMe ? localHand.length : p.handSize) === 1 && !isPlayerEliminated && (
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: 'linear-gradient(135deg, var(--color-red), #be123c)',
                  color: '#fff',
                  fontSize: '0.6rem',
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: '10px',
                  boxShadow: '0 2px 6px rgba(225, 29, 72, 0.3)',
                  animation: 'pulse-active 1.5s infinite',
                }}>
                  UNO!
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Play Area Container */}
      <div style={{
        position: 'absolute',
        top: '170px',
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden'
      }}>

        {/* Timeout Notification */}
        {timeoutNotification && (
          <div style={{
            position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, background: 'rgba(230, 57, 70, 0.95)', color: '#fff',
            padding: '12px 24px', borderRadius: '12px', fontWeight: 800, fontSize: '1.1rem',
            boxShadow: '0 4px 15px rgba(230, 57, 70, 0.4)',
          }}>
            ⚠️ {timeoutNotification}
          </div>
        )}

        {/* Action Feed component */}
        <ActionFeed movesHistory={gameState.movesHistory} />

        {/* 3D Round Gaming Table */}
        <div className={`gameplay-table ${getTableClassName()}`} style={{
          border: gameState.activeSide === 'DARK' 
            ? `4px double ${colorMap[currentColor]}` 
            : `4px solid ${colorMap[currentColor]}`,
          boxShadow: `inset 0 0 30px var(--color-logo-glow), 0 10px 40px rgba(0,0,0,0.05), 0 0 20px ${colorGlowMap[currentColor]}`,
        }}>
          {/* Luxury casino branding - Frosted glass UNO logo watermark */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-15deg)',
            fontSize: '18rem',
            fontWeight: 900,
            color: 'var(--color-logo-text)',
            letterSpacing: '12px',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 1,
            fontFamily: "'Outfit', sans-serif",
            textShadow: 'var(--color-logo-shadow)',
            opacity: 0.8,
          }}>
            UNO
          </div>
          {/* Turn Direction Spinning indicator */}
          <div className={direction === 1 ? 'spin-cw' : 'spin-ccw'} style={{
            position: 'absolute', width: '280px', height: '280px',
            border: '2px dashed rgba(255,255,255,0.06)', borderRadius: '50%',
            pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ position: 'absolute', fontSize: '2rem', color: 'rgba(255,255,255,0.15)', transform: 'rotate(0deg) translateY(-130px)' }}>➔</div>
            <div style={{ position: 'absolute', fontSize: '2rem', color: 'rgba(255,255,255,0.15)', transform: 'rotate(120deg) translateY(-130px)' }}>➔</div>
            <div style={{ position: 'absolute', fontSize: '2rem', color: 'rgba(255,255,255,0.15)', transform: 'rotate(240deg) translateY(-130px)' }}>➔</div>
          </div>

          {/* Center Cards: Deck & Discard Pile */}
          <div style={{ display: 'flex', gap: '40px', zIndex: 10 }}>
            {/* Deck pile */}
            <div
              onClick={() => !isSpectator && !isScoringPhase && !isLocalPlayerEliminated && isMyTurn && !gameState.pendingChallenge && onDrawCard()}
              style={{
                width: '100px', height: '150px', borderRadius: '12px',
                border: gameState.activeSide === 'DARK' ? '3px solid #000' : '3px solid #fff',
                background: gameState.activeSide === 'DARK'
                  ? 'linear-gradient(135deg, #4b0082, #1a0033)'
                  : 'linear-gradient(135deg, #cc0000, #990000)',
                position: 'relative',
                boxShadow: '0 8px 15px rgba(0,0,0,0.6)',
                cursor: (!isSpectator && isMyTurn && !isLocalPlayerEliminated) ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.5rem',
              }}
            >
              {/* 3D stack layering */}
              <div style={{ position: 'absolute', top: '2px', left: '2px', width: '100%', height: '100%', border: gameState.activeSide === 'DARK' ? '3px solid #000' : '3px solid #fff', borderRadius: '12px', background: gameState.activeSide === 'DARK' ? '#330066' : '#990000', zIndex: -1, transform: 'translate(4px, 4px)' }} />
              <div style={{ position: 'absolute', top: '4px', left: '4px', width: '100%', height: '100%', border: gameState.activeSide === 'DARK' ? '3px solid #000' : '3px solid #fff', borderRadius: '12px', background: gameState.activeSide === 'DARK' ? '#1a0033' : '#660000', zIndex: -2, transform: 'translate(8px, 8px)' }} />

              <span style={{ transform: 'rotate(-25deg)', textShadow: '0 2px 4px rgba(0,0,0,0.4)', color: '#fff' }}>
                {gameState.activeSide === 'DARK' ? 'FLIP' : 'UNO'}
              </span>
              <span style={{ position: 'absolute', bottom: '8px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                ({drawPileSize})
              </span>
            </div>

            {/* Discard Pile */}
            <div style={{ position: 'relative', width: '100px', height: '150px' }}>
              <Card card={topDiscardCard} disabled={true} activeSide={gameState.activeSide} />

              {/* Current Active Color banner */}
              <div style={{
                position: 'absolute', top: '-25px', left: '10px',
                background: colorMap[currentColor], color: currentColor === 'YELLOW' ? '#000' : '#fff',
                padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700,
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '1px',
                transition: 'background 0.3s ease'
              }}>
                {currentColor}
              </div>

              {/* Stacking total overlay (No Mercy) */}
              {gameState.gameVariant === 'MERCY' && gameState.stackedDrawTotal && gameState.stackedDrawTotal > 0 ? (
                <div style={{
                  position: 'absolute', bottom: '-30px', left: '-15px', right: '-15px',
                  background: 'linear-gradient(135deg, #e63946, #d62828)', color: '#fff',
                  padding: '4px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 800,
                  textAlign: 'center', boxShadow: '0 4px 12px rgba(230,57,70,0.5)',
                  border: '2px solid #fff', zIndex: 120, animation: 'pulse-active 1s infinite'
                }}>
                  STACK: +{gameState.stackedDrawTotal}!!
                </div>
              ) : null}
            </div>
          </div>
        </div>



        {/* Wild Color Selection Overlay (Active Player only) */}
        {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && (wildCardPendingId || (waitingForStartingColor && isMyTurn)) && (
          <div className="glass-panel" style={{
            position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%, -50%)',
            zIndex: 100, padding: '24px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h4 style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-text)' }}>Select Action Color</h4>

            {/* Support variant colors */}
            {gameState.activeSide === 'DARK' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '160px', height: '160px' }}>
                <button onClick={() => handleSelectColor('PINK')} style={{ background: '#ff2d7a', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
                <button onClick={() => handleSelectColor('TEAL')} style={{ background: '#00d2c4', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
                <button onClick={() => handleSelectColor('ORANGE')} style={{ background: '#ff8a00', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
                <button onClick={() => handleSelectColor('PURPLE')} style={{ background: '#9d00ff', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '160px', height: '160px' }}>
                <button onClick={() => handleSelectColor('RED')} style={{ background: 'var(--color-red)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
                <button onClick={() => handleSelectColor('YELLOW')} style={{ background: 'var(--color-yellow)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
                <button onClick={() => handleSelectColor('GREEN')} style={{ background: 'var(--color-green)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
                <button onClick={() => handleSelectColor('BLUE')} style={{ background: 'var(--color-blue)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
              </div>
            )}
          </div>
        )}

        {/* WD4 Challenge Overlay (Affected player only) */}
        {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && pendingChallenge && myId === gameState.challengeTarget && (
          <div className="glass-panel" style={{
            position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%, -50%)',
            zIndex: 100, padding: '30px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '20px', width: '320px', textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: 'var(--color-yellow)', fontWeight: 800, fontSize: '1.3rem' }}>Challenge +4?</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: '1.35rem' }}>
              You can challenge the player. If they bluffed (held color matching discard before play), they draw 4 instead of you. If legal, you draw 6!
            </p>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button onClick={() => onSendChallenge(true)} className="red-button" style={{ flex: 1, padding: '10px' }}>
                Challenge
              </button>
              <button onClick={() => onSendChallenge(false)} className="primary-button" style={{ flex: 1, padding: '10px' }}>
                Accept (+4)
              </button>
            </div>
          </div>
        )}

        {/* Mercy 7s Swap Hand Picker Overlay (Active Player only) */}
        {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && gameState.pendingSwapTarget && (
          <div className="glass-panel" style={{
            position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%, -50%)',
            zIndex: 100, padding: '24px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '16px', minWidth: '300px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: 'var(--color-yellow)', fontWeight: 800, fontSize: '1.3rem' }}>7 Swap Target</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Choose an opponent to trade hands with:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {players
                .filter((p: any) => p.id !== myId && !gameState.eliminatedPlayers?.includes(p.id))
                .map((opponent: any) => (
                  <button
                    key={opponent.id}
                    onClick={() => onSelectSwapTarget(opponent.id)}
                    className="glass-button"
                    style={{ width: '100%', padding: '12px', fontWeight: 700 }}
                  >
                    {opponent.username} ({opponent.handSize} Cards)
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Mercy Color Roulette Selector Overlay (Active Player only) */}
        {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && gameState.pendingRouletteColor && (
          <div className="glass-panel" style={{
            position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%, -50%)',
            zIndex: 100, padding: '24px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '16px', minWidth: '300px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: 'var(--color-red)', fontWeight: 800, fontSize: '1.3rem' }}>🎡 COLOR ROULETTE 🎡</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              You must choose a color. You will draw cards until you draw a card of this color!
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '160px', height: '160px' }}>
              <button onClick={() => onSelectRouletteColor('RED')} style={{ background: 'var(--color-red)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
              <button onClick={() => onSelectRouletteColor('YELLOW')} style={{ background: 'var(--color-yellow)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
              <button onClick={() => onSelectRouletteColor('GREEN')} style={{ background: 'var(--color-green)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
              <button onClick={() => onSelectRouletteColor('BLUE')} style={{ background: 'var(--color-blue)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }} />
            </div>
          </div>
        )}

        {/* Side Panels: Chat */}
        <div className="chat-panel-container" style={{ position: 'absolute', right: '20px', bottom: '20px', zIndex: 40 }}>
          <ChatPanel
            messages={chatMessages}
            onSendMessage={onSendMessage}
            onSendEmoji={onSendEmoji}
          />
        </div>

        {/* Floating Emoji overlay for current player */}
        {activeEmoji?.playerId === myId && (
          <div style={{
            position: 'absolute', bottom: '150px', left: '50%', transform: 'translateX(-50%)',
            fontSize: '3rem', zIndex: 120, animation: 'rotate-clockwise 0.5s ease'
          }}>
            {activeEmoji.emojiCode}
          </div>
        )}

        {/* Bottom Interface: Active User Profile & Hand cards */}
        <div style={{
          position: 'absolute', bottom: '0px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          width: '90%', maxWidth: '850px', zIndex: 30, paddingBottom: '10px'
        }}>

          {/* Action Controls: UNO, Pass */}
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {isMyTurn && gameState.waitingForStartingColor && (
              <div style={{ color: 'var(--color-yellow)', fontWeight: 700, animation: 'pulse-active 2s infinite' }}>
                Select starting color to play!
              </div>
            )}

            {/* UNO Button */}
            {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && (
              <button
                onClick={onCallUno}
                className="red-button pulse-active"
                style={{
                  padding: '10px 24px', borderRadius: '20px',
                  fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(225, 29, 72, 0.3)',
                }}
              >
                UNO!
              </button>
            )}

            {/* Pass Turn Button (Disabled in Mercy) */}
            {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && isMyTurn && gameState.gameVariant !== 'MERCY' && gameState.drawPileSize > 0 && (
              <button
                onClick={onPassTurn}
                className="glass-button"
                style={{
                  borderRadius: '20px', padding: '10px 24px', fontSize: '1rem'
                }}
              >
                Pass Turn
              </button>
            )}

            {/* Catch UNO button */}
            {!isSpectator && !isScoringPhase && !isLocalPlayerEliminated && vulnerablePlayer && (
              <button
                onClick={() => onCatchUno(vulnerablePlayer.id)}
                className="primary-button"
                style={{
                  borderRadius: '20px', padding: '10px 24px', background: 'var(--color-yellow)',
                  color: '#fff', fontWeight: 700, border: 'none', fontSize: '0.95rem',
                  boxShadow: '0 4px 14px rgba(217, 119, 6, 0.25)',
                }}
              >
                Catch {vulnerablePlayer.username} UNO!
              </button>
            )}
          </div>

          {/* Local Player HUD Stats Badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: 'var(--color-hud-bg)', padding: '8px 20px',
            borderRadius: '20px', border: '1px solid var(--border-glass)',
            boxShadow: 'var(--shadow-button)', marginTop: '5px'
          }}>
            <span style={{ fontSize: '1rem' }}>{mySeat?.isBot ? '🤖' : '👤'}</span>
            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{mySeat?.username || 'You'}</span>
            <span style={{ color: 'var(--color-text-muted)', opacity: 0.5, fontSize: '0.9rem' }}>|</span>
            <span style={{ color: 'var(--color-yellow)', fontWeight: 800 }}>{localHand.length} Cards</span>
            {isScoringPhase && (
              <>
                <span style={{ color: 'var(--color-text-muted)', opacity: 0.5, fontSize: '0.9rem' }}>|</span>
                <span style={{
                  color: 'var(--color-yellow)', fontWeight: 900,
                  background: 'rgba(217, 119, 6, 0.1)', padding: '2px 8px',
                  borderRadius: '10px', animation: 'pulse-active 1.5s infinite'
                }}>
                  Points: {getPlayerScore(myId)}
                </span>
              </>
            )}
          </div>

          {/* Fanned User Hand cards layout */}
          <div
            ref={handRef}
            className="player-hand-container"
            style={{
              display: 'flex',
              justifyContent: isOverflowing ? 'flex-start' : 'center',
              alignItems: 'flex-end',
              height: '180px',
              width: '100%',
              overflowX: 'auto',
              overflowY: 'hidden',
              touchAction: 'pan-x',
              overscrollBehaviorX: 'contain',
              overscrollBehaviorY: 'contain',
              padding: '10px 30px',
              paddingLeft: isOverflowing ? '40px' : '30px',
              paddingRight: isOverflowing ? '40px' : '30px',
              gap: '-20px',
              position: 'relative',
              boxSizing: 'border-box',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {isLocalPlayerEliminated ? (
              /* Elimination Overlay Banner for Local Player */
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(37, 2, 5, 0.85)', borderRadius: '16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--color-red)', zIndex: 120, gap: '10px',
                boxShadow: '0 -4px 30px rgba(255, 0, 0, 0.2)'
              }}>
                <span style={{ fontSize: '2.5rem' }}>☠️</span>
                <h2 style={{ color: 'var(--color-red)', fontWeight: 900, fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  You Have Been Eliminated!
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                  You reached 25+ cards in your hand. You are now spectating this match.
                </p>
              </div>
            ) : (
              (localHand || []).filter(Boolean).map((card: any, idx: number) => {
                const playable = isCardPlayable(card);
                const activeSide = gameState.activeSide || 'LIGHT';

                // Calculate rotational/fanning translation offset
                const total = localHand.length;
                const mid = (total - 1) / 2;
                const rotation = (idx - mid) * (isMobileHand ? 1.5 : 4); // degrees
                const translateOffset = Math.abs(idx - mid) * (isMobileHand ? 0.8 : 2); // px translateY down

                return (
                  <div
                    key={card.id}
                    style={{
                      marginRight: idx === total - 1 ? 0 : '-34px', // overlapping layout
                      transform: `translateY(${translateOffset}px) rotate(${rotation}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = `translateY(${translateOffset - 28}px) scale(1.1) rotate(${rotation}deg)`;
                      e.currentTarget.style.zIndex = '100';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = `translateY(${translateOffset}px) rotate(${rotation}deg)`;
                      e.currentTarget.style.zIndex = 'auto';
                    }}
                  >
                    <Card
                      card={card}
                      onClick={() => handleCardClick(card)}
                      isPlayable={playable}
                      disabled={isMyTurn && !playable}
                      activeSide={activeSide}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
