import React, { useRef, useState } from 'react';
import { Card as CardType, CardColor } from '../../../../shared/src/types';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  isPlayable?: boolean;
  scale?: number;
  activeSide?: 'LIGHT' | 'DARK';
}

export const Card = ({
  card,
  onClick,
  disabled = false,
  isPlayable = false,
  scale = 1,
  activeSide = 'LIGHT',
}: CardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tiltStyle, setTiltStyle] = useState<React.CSSProperties>({});

  if (!card) {
    console.error("Card component received undefined card");
    return (
      <div
        style={{
          width: 90,
          height: 130,
          background: "red",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8
        }}
      >
        Missing Card
      </div>
    );
  }

  // Get active face parameters depending on side
  const face = (activeSide === 'DARK' && card.darkFace) ? card.darkFace : { color: card.color, value: card.value };

  // 3D Card tilting on mouse hover
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !cardRef.current) return;

    const cardEl = cardRef.current;
    const rect = cardEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;

    const rotateX = ((yc - y) / yc) * 15;
    const rotateY = ((x - xc) / xc) * 15;

    setTiltStyle({
      transform: `perspective(300px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`,
      transition: 'transform 0.05s ease',
      zIndex: 50,
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: 'perspective(300px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.25s ease',
    });
  };

  const colorMap: Record<CardColor, string> = {
    RED: 'var(--color-red)',
    YELLOW: 'var(--color-yellow)',
    GREEN: 'var(--color-green)',
    BLUE: 'var(--color-blue)',
    WILD: 'var(--color-secondary)',
    // Flip dark-side colors
    PINK: '#ff2d7a',
    TEAL: '#00d2c4',
    ORANGE: '#ff8a00',
    PURPLE: '#9d00ff',
  };

  const glowMap: Record<CardColor, string> = {
    RED: 'var(--glow-red)',
    YELLOW: 'var(--glow-yellow)',
    GREEN: 'var(--glow-green)',
    BLUE: 'var(--glow-blue)',
    WILD: '0 0 20px rgba(255, 255, 255, 0.25)',
    // Flip dark-side glows
    PINK: '0 0 20px rgba(255, 45, 122, 0.6)',
    TEAL: '0 0 20px rgba(0, 210, 196, 0.6)',
    ORANGE: '0 0 20px rgba(255, 138, 0, 0.6)',
    PURPLE: '0 0 20px rgba(157, 0, 255, 0.6)',
  };

  const getSymbol = () => {
    const fill = face.color === 'WILD' ? '#fff' : colorMap[face.color];

    switch (face.value) {
      case 'SKIP':
        return (
          <svg viewBox="0 0 100 100" style={{ width: '40%', height: '40%' }}>
            <circle cx="50" cy="50" r="35" fill="none" stroke={fill} strokeWidth="12" />
            <line x1="25" y1="25" x2="75" y2="75" stroke={fill} strokeWidth="12" />
          </svg>
        );
      case 'SKIP_EVERYONE':
        return (
          <svg viewBox="0 0 100 100" style={{ width: '55%', height: '55%' }}>
            <circle cx="35" cy="50" r="20" fill="none" stroke={fill} strokeWidth="8" />
            <line x1="21" y1="36" x2="49" y2="64" stroke={fill} strokeWidth="8" />
            <circle cx="65" cy="50" r="20" fill="none" stroke={fill} strokeWidth="8" />
            <line x1="51" y1="36" x2="79" y2="64" stroke={fill} strokeWidth="8" />
          </svg>
        );
      case 'REVERSE':
        return (
          <svg viewBox="0 0 100 100" style={{ width: '45%', height: '45%' }}>
            <path d="M 25,35 L 75,35 M 75,35 L 60,20 M 75,35 L 60,50" fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 75,65 L 25,65 M 25,65 L 40,50 M 25,65 L 40,80" fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'DRAW_ONE':
      case 'DRAW_TWO':
      case 'DRAW_FOUR':
      case 'DRAW_FIVE': {
        const valStr = face.value === 'DRAW_ONE' ? '+1' 
                     : face.value === 'DRAW_TWO' ? '+2'
                     : face.value === 'DRAW_FOUR' ? '+4'
                     : '+5';
        return (
          <div style={{ position: 'relative', width: '50%', height: '50%' }}>
            <div style={{
              position: 'absolute', top: '10%', left: '10%', width: '50%', height: '70%',
              border: `4px solid ${fill}`, borderRadius: '6px', backgroundColor: 'var(--bg-secondary)',
              transform: 'rotate(-10deg)'
            }} />
            <div style={{
              position: 'absolute', top: '20%', left: '40%', width: '50%', height: '70%',
              border: `4px solid ${fill}`, borderRadius: '6px', backgroundColor: 'var(--bg-secondary)',
              transform: 'rotate(10deg)'
            }} />
            <span style={{
              position: 'absolute', top: '40%', left: '15%', fontSize: '1.2rem', fontWeight: 800, color: fill,
              textShadow: '0 2px 4px rgba(0,0,0,0.5)'
            }}>{valStr}</span>
          </div>
        );
      }
      case 'FLIP':
        return (
          <svg viewBox="0 0 100 100" style={{ width: '45%', height: '45%' }}>
            <path d="M 25,35 L 75,35 M 75,35 L 60,20 M 75,35 L 60,50" fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 75,65 L 25,65 M 25,65 L 40,50 M 25,65 L 40,80" fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="50" r="10" fill={fill} />
          </svg>
        );
      case 'DISCARD_ALL':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: fill }}>🗂️</span>
          </div>
        );
      case 'WILD':
        return (
          <svg viewBox="0 0 100 100" style={{ width: '50%', height: '50%' }}>
            <circle cx="50" cy="50" r="35" fill="none" stroke="#fff" strokeWidth="4" />
            <path d="M 50,50 L 50,15 A 35,35 0 0,1 85,50 Z" fill="var(--color-blue)" />
            <path d="M 50,50 L 85,50 A 35,35 0 0,1 50,85 Z" fill="var(--color-yellow)" />
            <path d="M 50,50 L 50,85 A 35,35 0 0,1 15,50 Z" fill="var(--color-red)" />
            <path d="M 50,50 L 15,50 A 35,35 0 0,1 50,15 Z" fill="var(--color-green)" />
          </svg>
        );
      case 'WILD_DRAW_FOUR':
      case 'WILD_DRAW_TWO':
      case 'WILD_DRAW_SIX':
      case 'WILD_DRAW_TEN':
      case 'WILD_REVERSE_DRAW_FOUR':
      case 'WILD_DRAW_COLOR':
      case 'WILD_COLOR_ROULETTE': {
        const text = face.value === 'WILD_DRAW_FOUR' ? '+4'
                   : face.value === 'WILD_DRAW_TWO' ? '+2'
                   : face.value === 'WILD_DRAW_SIX' ? '+6'
                   : face.value === 'WILD_DRAW_TEN' ? '+10'
                   : face.value === 'WILD_REVERSE_DRAW_FOUR' ? '🔄+4'
                   : face.value === 'WILD_DRAW_COLOR' ? '🌈'
                   : '🎡';
        return (
          <div style={{ position: 'relative', width: '60%', height: '60%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 100 100" style={{ width: '65%', height: '65%', transform: 'scale(1.2)' }}>
              <circle cx="50" cy="50" r="35" fill="none" stroke="#fff" strokeWidth="4" />
              <path d="M 50,50 L 50,15 A 35,35 0 0,1 85,50 Z" fill="var(--color-blue)" />
              <path d="M 50,50 L 85,50 A 35,35 0 0,1 50,85 Z" fill="var(--color-yellow)" />
              <path d="M 50,50 L 50,85 A 35,35 0 0,1 15,50 Z" fill="var(--color-red)" />
              <path d="M 50,50 L 15,50 A 35,35 0 0,1 50,15 Z" fill="var(--color-green)" />
            </svg>
            <span style={{
              position: 'absolute', fontSize: text.length > 2 ? '1rem' : '1.3rem', fontWeight: 900, color: '#fff',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)'
            }}>{text}</span>
          </div>
        );
      }
      default:
        return (
          <span className="card-center-value" style={{
            fontSize: '3.6rem', fontWeight: 800, color: '#fff',
            textShadow: '0 4px 8px rgba(0,0,0,0.3)', fontStyle: 'italic'
          }}>{face.value}</span>
        );
    }
  };

  const getMiniLabel = (value: string) => {
    switch (value) {
      case 'SKIP': return '🚫';
      case 'SKIP_EVERYONE': return '🚫🚫';
      case 'REVERSE': return '⇆';
      case 'DRAW_ONE': return '+1';
      case 'DRAW_TWO': return '+2';
      case 'DRAW_FOUR': return '+4';
      case 'DRAW_FIVE': return '+5';
      case 'DISCARD_ALL': return '🗂️';
      case 'FLIP': return '🔄';
      case 'WILD': return '🎨';
      case 'WILD_DRAW_FOUR': return '+4';
      case 'WILD_DRAW_TWO': return '+2';
      case 'WILD_DRAW_SIX': return '+6';
      case 'WILD_DRAW_TEN': return '+10';
      case 'WILD_REVERSE_DRAW_FOUR': return '🔄+4';
      case 'WILD_DRAW_COLOR': return '🌈';
      case 'WILD_COLOR_ROULETTE': return '🎡';
      default: return value;
    }
  };

  const isWild = face.color === 'WILD';

  const cardStyle: React.CSSProperties = {
    width: '102px',
    height: '157px',
    borderRadius: '13px',
    border: activeSide === 'DARK' ? '3.5px solid #000' : '3.5px solid #fff',
    background: isWild ? 'var(--bg-secondary)' : colorMap[face.color],
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxShadow: isPlayable && !disabled ? glowMap[face.color] : '0 4px 10px rgba(0,0,0,0.4)',
    borderCollapse: 'separate',
    transformOrigin: 'center center',
    transform: `scale(${scale})`,
    userSelect: 'none',
    touchAction: 'none',
    transition: 'transform 0.3s ease, border-color 0.3s ease, background 0.3s ease',
    ...tiltStyle,
  };

  return (
    <div
      ref={cardRef}
      style={cardStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => !disabled && onClick && onClick()}
      className={`card ${isPlayable ? 'playable pulse-active' : ''}`}
      aria-label={`${face.color} ${face.value}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && onClick && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Pattern overlay for colorblind assistance */}
      {!isWild && <div className={`pattern-${face.color}`} style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: '12px', opacity: 0.15, pointerEvents: 'none'
      }} />}

      {/* Internal decorative oval layer */}
      <div style={{
        position: 'absolute', top: '8%', left: '8%', right: '8%', bottom: '8%',
        borderRadius: '50% / 30%', border: activeSide === 'DARK' ? '2px solid rgba(255,255,255,0.06)' : '2px solid rgba(255,255,255,0.15)',
        background: 'rgba(0,0,0,0.1)', pointerEvents: 'none'
      }} />

      {/* Top Left Mini indicator */}
      {!isWild && (
        <span className="card-mini-label card-mini-top" style={{
          position: 'absolute', top: '6px', left: '8px',
          fontSize: '0.85rem', fontWeight: 800, color: '#fff', opacity: 0.8
        }}>
          {getMiniLabel(face.value)}
        </span>
      )}

      {/* Main center symbol */}
      <div className="card-center-container" style={{ zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        {getSymbol()}
      </div>

      {/* Bottom Right Mini indicator */}
      {!isWild && (
        <span className="card-mini-label card-mini-bottom" style={{
          position: 'absolute', bottom: '6px', right: '8px',
          fontSize: '0.85rem', fontWeight: 800, color: '#fff', opacity: 0.8,
          transform: 'rotate(180deg)'
        }}>
          {getMiniLabel(face.value)}
        </span>
      )}
    </div>
  );
};
