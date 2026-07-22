import { CardColor, GameVariant } from '../../../shared/src/types';

interface LeaderboardProps {
  winnerId: string;
  players: { id: string; username: string; avatarId: string; handSize: number }[];
  matchDuration: string | null;
  totalMoves: number;
  mostUsedColor: CardColor | null;
  matchStatistics: {
    playerId: string;
    username: string;
    rank: number;
    cardsPlayed: number;
    cardsDrawn: number;
    score: number;
  }[] | null;
  isHost: boolean;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
  eliminatedPlayers?: string[];
  gameVariant?: GameVariant;
}

export const Leaderboard = ({
  winnerId,
  players,
  matchDuration,
  totalMoves,
  mostUsedColor,
  matchStatistics,
  isHost,
  onPlayAgain,
  onReturnLobby,
  eliminatedPlayers = [],
  gameVariant = 'CLASSIC',
}: LeaderboardProps) => {
  // Fallback sorting in case matchStatistics is not ready (e.g. spectator or latency transition)
  const sortedStats = matchStatistics || [...players]
    .sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      return a.handSize - b.handSize;
    })
    .map((p, idx) => ({
      playerId: p.id,
      username: p.username,
      rank: idx + 1,
      cardsPlayed: 0,
      cardsDrawn: 0,
      score: 0,
    }));

  const podium = [
    sortedStats.find((s) => s.rank === 2), // 2nd place
    sortedStats.find((s) => s.rank === 1), // 1st place
    sortedStats.find((s) => s.rank === 3), // 3rd place
  ].filter(Boolean);

  const colorConfig = mostUsedColor && mostUsedColor !== 'WILD' ? ({
    RED: { label: 'Red', emoji: '🔴' },
    YELLOW: { label: 'Yellow', emoji: '🟡' },
    GREEN: { label: 'Green', emoji: '🟢' },
    BLUE: { label: 'Blue', emoji: '🔵' },
    PINK: { label: 'Pink', emoji: '💗' },
    TEAL: { label: 'Teal', emoji: '💎' },
    ORANGE: { label: 'Orange', emoji: '🍊' },
    PURPLE: { label: 'Purple', emoji: '🔮' },
  } as Record<string, { label: string; emoji: string }>)[mostUsedColor] : null;

  const isPlayerEliminated = (id: string) => eliminatedPlayers.includes(id);

  const getVariantLabel = () => {
    switch (gameVariant) {
      case 'FLIP': return 'UNO FLIP';
      case 'MERCY': return "UNO SHOW'EM NO MERCY";
      default: return 'CLASSIC UNO';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', padding: '30px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      
      {/* Victory Screen / Podium */}
      <div className="glass-panel" style={{ width: '100%', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-yellow)', textShadow: '0 2px 8px rgba(0,0,0,0.03)', textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center' }}>
          🎉 Victory Podium 🎉
        </h2>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {getVariantLabel()}
        </div>

        {/* Podium Layout */}
        <div className="podium-container" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '15px', height: '220px', margin: '20px 0', width: '100%' }}>
          
          {/* 2nd place */}
          {podium[0] && (
            <div className="podium-item" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '110px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>
                {podium[0].username}
              </span>
              <div style={{
                height: '110px', width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-glass)',
                borderBottom: 'none', borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.03)'
              }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text-muted)' }}>2</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>🥈 Runner-Up</span>
              </div>
            </div>
          )}

          {/* 1st place (winner) */}
          {podium[1] && (
            <div className="podium-item" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '130px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-yellow)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>
                👑 {podium[1].username}
              </span>
              <div style={{
                height: '150px', width: '100%', background: 'linear-gradient(to top, rgba(217,119,6,0.05), rgba(217,119,6,0.15))',
                border: '2px solid var(--color-yellow)', borderBottom: 'none', borderRadius: '12px 12px 0 0', display: 'flex',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(217,119,6,0.15)'
              }}>
                <span style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--color-yellow)', textShadow: '0 2px 4px rgba(217,119,6,0.2)' }}>1</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-yellow)', fontWeight: 600 }}>🏆 Champion</span>
              </div>
            </div>
          )}

          {/* 3rd place */}
          {podium[2] && (
            <div className="podium-item" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '110px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>
                {podium[2].username}
              </span>
              <div style={{
                height: '80px', width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                borderBottom: 'none', borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)'
              }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: '#b45309' }}>3</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>🥉 Third</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Match stats */}
        <div style={{ display: 'flex', gap: '30px', margin: '20px 0', flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)', padding: '15px 0', width: '100%' }}>
          <div>
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Match Duration: </span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--color-text)' }}>{matchDuration || '0s'}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Total Moves: </span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--color-text)' }}>{totalMoves}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Most Used Color: </span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--color-text)' }}>
              {colorConfig ? `${colorConfig.emoji} ${colorConfig.label}` : 'N/A'}
            </strong>
          </div>
        </div>

        {/* Command Buttons */}
        {isHost ? (
          <div style={{ display: 'flex', gap: '15px', width: '100%', justifyItems: 'center', justifyContent: 'center', marginTop: '10px' }}>
            <button className="green-button" onClick={onPlayAgain} style={{ fontSize: '1.05rem', padding: '12px 24px', flex: 1, maxWidth: '200px' }}>
              Play Again
            </button>
            <button className="glass-button" onClick={onReturnLobby} style={{ fontSize: '1.05rem', padding: '12px 24px', flex: 1, maxWidth: '200px' }}>
              Return Lobby
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '1rem', fontWeight: 600, textAlign: 'center', marginTop: '15px', animation: 'pulse-active 2.5s infinite' }}>
            ⏳ Waiting for Host to decide next match...
          </div>
        )}
      </div>

      {/* Match Report table */}
      <div className="glass-panel" style={{ width: '100%', padding: '30px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px', color: 'var(--color-yellow)' }}>
          📊 Match Report
        </h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--border-glass)', fontSize: '0.95rem' }}>
              <th style={{ padding: '12px 8px' }}>Rank</th>
              <th style={{ padding: '12px 8px' }}>Player</th>
              <th style={{ padding: '12px 8px', textAlign: 'center' }}>Cards Played</th>
              <th style={{ padding: '12px 8px', textAlign: 'center' }}>Cards Drawn</th>
              <th style={{ padding: '12px 8px', textAlign: 'center' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((row) => (
              <tr key={row.playerId} style={{
                borderBottom: '1px solid var(--border-glass)',
                background: row.playerId === winnerId ? 'rgba(217,119,6,0.03)' : 'transparent',
                opacity: isPlayerEliminated(row.playerId) ? 0.6 : 1
              }}>
                <td style={{ padding: '14px 8px', fontWeight: 700, color: row.rank === 1 ? 'var(--color-yellow)' : 'var(--color-text)' }}>
                  {row.rank === 1 ? '🥇 1st' : row.rank === 2 ? '🥈 2nd' : row.rank === 3 ? '🥉 3rd' : `#${row.rank}`}
                </td>
                <td style={{ padding: '14px 8px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {row.username} {row.playerId === winnerId && '🏆'} {isPlayerEliminated(row.playerId) && '💀 (Eliminated)'}
                </td>
                <td style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--color-green)' }}>
                  {row.cardsPlayed}
                </td>
                <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--color-blue)', fontWeight: 700 }}>
                  {row.cardsDrawn}
                </td>
                <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--color-yellow)', fontWeight: 800 }}>
                  {row.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
