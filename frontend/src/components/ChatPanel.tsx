import React, { useState, useEffect, useRef } from 'react';

interface ChatPanelProps {
  messages: { id: string; senderName: string; message: string; timestamp: string }[];
  onSendMessage: (msg: string) => void;
  onSendEmoji: (emoji: string) => void;
}

export const ChatPanel = ({
  messages,
  onSendMessage,
  onSendEmoji,
}: ChatPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<{ id: string; senderName: string; message: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 600);
  
  const prevMsgLength = useRef(messages.length);
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickMessages = ['UNO!', 'Good luck!', 'Nice move!', 'Oops!', 'GG!'];
  const emojis = ['😂', '🔥', '😮', '👍', '😭', '👑'];

  // Handle mobile responsiveness check
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 600);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync scroll to bottom on new messages if open
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Unread badge count and toast notifications sync when closed
  useEffect(() => {
    if (messages.length > prevMsgLength.current) {
      const newMsgs = messages.slice(prevMsgLength.current);
      if (!isOpen) {
        setUnreadCount((c) => c + newMsgs.length);
        
        const newToasts = newMsgs.map((m) => ({
          id: m.id,
          senderName: m.senderName,
          message: m.message,
        }));
        
        setToasts((t) => [...t, ...newToasts]);

        // Auto-remove toast after 3.5 seconds
        newToasts.forEach((nt) => {
          setTimeout(() => {
            setToasts((currentToasts) => currentToasts.filter((t) => t.id !== nt.id));
          }, 3500);
        });
      }
    }
    prevMsgLength.current = messages.length;
  }, [messages, isOpen]);

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      setUnreadCount(0);
      setToasts([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast Notifications Stack */}
      {!isOpen && toasts.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '70px',
          right: '0px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
          pointerEvents: 'none',
          zIndex: 100,
          width: '280px',
        }}>
          {toasts.map((t) => (
            <div key={t.id} style={{
              background: 'var(--color-overlay-bg)',
              border: '1px solid var(--border-glass)',
              borderRadius: '12px',
              padding: '10px 14px',
              color: 'var(--color-text)',
              boxShadow: 'var(--shadow-panel)',
              backdropFilter: 'blur(8px)',
              fontSize: '0.85rem',
              animation: 'slide-up-fade-in 0.2s ease forwards',
              pointerEvents: 'auto',
              width: '100%',
              lineHeight: '1.2rem',
            }}>
              <strong style={{ color: 'var(--color-blue)' }}>{t.senderName}: </strong>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Floating Chat Panel (Desktop vs Mobile Sheet) */}
      {isOpen && (
        <div 
          className="glass-panel chat-panel-modal"
          style={isMobile ? {
            position: 'fixed',
            bottom: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90vw',
            height: '380px',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            gap: '10px',
            zIndex: 200,
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          } : {
            position: 'absolute',
            bottom: '76px',
            right: '0px',
            width: '320px',
            height: '420px',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            gap: '12px',
            zIndex: 110,
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            animation: 'slide-up-fade-in 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)' }}>Room Chat</h3>
            <button onClick={handleToggle} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Logs */}
          <div ref={scrollRef} style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingRight: '4px',
          }}>
            {messages.map((m) => (
              <div key={m.id} style={{ fontSize: '0.9rem', lineHeight: '1.25rem' }}>
                <strong style={{ color: 'var(--color-blue)' }}>{m.senderName}: </strong>
                <span style={{ color: 'var(--color-text)' }}>{m.message}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '60px' }}>
                No chat yet. Say hi!
              </div>
            )}
          </div>

          {/* Emojis Palette */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 0',
            borderTop: '1px solid var(--border-glass)'
          }}>
            {emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSendEmoji(emoji)}
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', transition: 'transform 0.15s ease' }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Quick Messages */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {quickMessages.map((msg) => (
              <button
                key={msg}
                onClick={() => onSendMessage(msg)}
                style={{
                  padding: '4px 8px', borderRadius: '12px', background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)', color: 'var(--color-text)', fontSize: '0.75rem',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {msg}
              </button>
            ))}
          </div>

          {/* Submit form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message..."
              maxLength={120}
              style={{
                flex: 1,
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                color: 'var(--color-text)',
                padding: '8px 12px',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
            <button type="submit" className="glass-button" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>Send</button>
          </form>
        </div>
      )}

      {/* Circular Floating Chat Toggle Button */}
      <button
        onClick={handleToggle}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-blue), #2563eb)',
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = isOpen ? 'rotate(90deg) scale(1.05)' : 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 10px 28px rgba(37,99,235,0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = isOpen ? 'rotate(90deg)' : 'none';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(37,99,235,0.4)';
        }}
      >
        {isOpen ? (
          <span style={{ fontSize: '1.4rem' }}>✕</span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}

        {/* Unread Message Badge */}
        {!isOpen && unreadCount > 0 && (
          <div style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            fontSize: '0.75rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 5px rgba(239,68,68,0.5)',
            animation: 'scale-up-fade-in 0.15s ease'
          }}>
            {unreadCount}
          </div>
        )}
      </button>
    </div>
  );
};
