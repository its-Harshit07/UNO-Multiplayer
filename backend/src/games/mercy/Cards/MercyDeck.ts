import { randomUUID } from 'crypto';
import { Card, CardColor, CardValue } from '../../../../../shared/src/types';

/**
 * Creates a fresh, standard 168-card UNO Show'em No Mercy deck.
 */
export function generateMercyDeck(): Card[] {
  const deck: Card[] = [];
  const colors: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

  for (const color of colors) {
    // Two of each: 0 to 9
    for (let i = 0; i <= 9; i++) {
      const valStr = i.toString() as CardValue;
      deck.push({ id: randomUUID(), color, value: valStr });
      deck.push({ id: randomUUID(), color, value: valStr });
    }

    // 3 Skip Cards per color
    for (let i = 0; i < 3; i++) {
      deck.push({ id: randomUUID(), color, value: 'SKIP' });
    }

    // 3 Reverse Cards per color
    for (let i = 0; i < 3; i++) {
      deck.push({ id: randomUUID(), color, value: 'REVERSE' });
    }

    // 3 Draw Two Cards per color
    for (let i = 0; i < 3; i++) {
      deck.push({ id: randomUUID(), color, value: 'DRAW_TWO' });
    }

    // 2 Draw Four Cards per color (colored in Mercy)
    for (let i = 0; i < 2; i++) {
      deck.push({ id: randomUUID(), color, value: 'DRAW_FOUR' });
    }

    // 2 Skip Everyone Cards per color (colored in Mercy)
    for (let i = 0; i < 2; i++) {
      deck.push({ id: randomUUID(), color, value: 'SKIP_EVERYONE' });
    }

    // 3 Discard All Cards per color
    for (let i = 0; i < 3; i++) {
      deck.push({ id: randomUUID(), color, value: 'DISCARD_ALL' });
    }
  }

  // Wild Cards (Colorless)
  // 8 Color Roulette Cards
  for (let i = 0; i < 8; i++) {
    deck.push({ id: randomUUID(), color: 'WILD', value: 'WILD_COLOR_ROULETTE' });
  }

  // 8 Wild Reverse Draw 4 Cards
  for (let i = 0; i < 8; i++) {
    deck.push({ id: randomUUID(), color: 'WILD', value: 'WILD_REVERSE_DRAW_FOUR' });
  }

  // 4 Wild Draw 6 Cards
  for (let i = 0; i < 4; i++) {
    deck.push({ id: randomUUID(), color: 'WILD', value: 'WILD_DRAW_SIX' });
  }

  // 4 Wild Draw 10 Cards
  for (let i = 0; i < 4; i++) {
    deck.push({ id: randomUUID(), color: 'WILD', value: 'WILD_DRAW_TEN' });
  }

  return Object.freeze(deck) as Card[];
}
