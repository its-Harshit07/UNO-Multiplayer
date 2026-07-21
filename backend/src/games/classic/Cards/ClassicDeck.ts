import { randomUUID } from 'crypto';
import { Card, CardColor, CardValue } from '../../../../../shared/src/types';

/**
 * Creates a fresh, standard 108-card Classic UNO deck.
 */
export function generateClassicDeck(): Card[] {
  const deck: Card[] = [];
  const colors: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

  for (const color of colors) {
    // One 0 card
    deck.push({ id: randomUUID(), color, value: '0' });

    // Two of each: 1 to 9
    for (let i = 1; i <= 9; i++) {
      const valStr = i.toString() as CardValue;
      deck.push({ id: randomUUID(), color, value: valStr });
      deck.push({ id: randomUUID(), color, value: valStr });
    }

    // Two of each action card
    const actionValues: CardValue[] = ['SKIP', 'REVERSE', 'DRAW_TWO'];
    for (const val of actionValues) {
      deck.push({ id: randomUUID(), color, value: val });
      deck.push({ id: randomUUID(), color, value: val });
    }
  }

  // Four Wild and Four Wild Draw Four cards
  for (let i = 0; i < 4; i++) {
    deck.push({ id: randomUUID(), color: 'WILD', value: 'WILD' });
    deck.push({ id: randomUUID(), color: 'WILD', value: 'WILD_DRAW_FOUR' });
  }

  return Object.freeze(deck) as Card[];
}
