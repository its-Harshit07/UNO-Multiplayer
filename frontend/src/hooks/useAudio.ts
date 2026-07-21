import { useState, useEffect, useCallback } from 'react';

export function useAudio() {
  const [muted, setMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('uno_muted') === 'true';
    }
    return false;
  });

  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('uno_volume') ?? '0.5');
    }
    return 0.5;
  });

  useEffect(() => {
    localStorage.setItem('uno_muted', String(muted));
  }, [muted]);

  useEffect(() => {
    localStorage.setItem('uno_volume', String(volume));
  }, [volume]);

  const playSound = useCallback((type: 'play' | 'draw' | 'shuffle' | 'tick' | 'uno' | 'victory') => {
    if (muted) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.connect(ctx.destination);

      if (type === 'play') {
        // Card play snap
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);
        gain.gain.setValueAtTime(volume * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'draw') {
        // Card draw slide
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.18);
        gain.gain.setValueAtTime(volume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'shuffle') {
        // Quick cascade of card rustling clicks
        for (let i = 0; i < 8; i++) {
          const t = now + i * 0.07;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(120 + i * 40, t);
          
          const g = ctx.createGain();
          g.gain.setValueAtTime(volume * 0.25, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
          g.connect(ctx.destination);

          osc.connect(g);
          osc.start(t);
          osc.stop(t + 0.05);
        }
      } else if (type === 'tick') {
        // Countdown timer tick
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(volume * 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);

        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.03);
      } else if (type === 'uno') {
        // Chime for UNO call
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(329.63, now); // E4
        osc1.frequency.setValueAtTime(440.00, now + 0.12); // A4

        osc2.frequency.setValueAtTime(329.63, now);
        osc2.frequency.setValueAtTime(440.00, now + 0.12);

        gain.gain.setValueAtTime(volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        
        osc1.start(now);
        osc1.stop(now + 0.35);
        osc2.start(now);
        osc2.stop(now + 0.35);
      } else if (type === 'victory') {
        // Major chord fanfare
        const freqs = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        freqs.forEach((f, idx) => {
          const t = now + idx * 0.12;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t);

          const g = ctx.createGain();
          g.gain.setValueAtTime(volume * 0.5, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
          g.connect(ctx.destination);

          osc.connect(g);
          osc.start(t);
          osc.stop(t + 0.35);
        });
      }
    } catch (e) {
      console.warn('Audio Context failed to play:', e);
    }
  }, [muted, volume]);

  return { muted, setMuted, volume, setVolume, playSound };
}
