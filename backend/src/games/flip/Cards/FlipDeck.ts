import { randomUUID } from 'crypto';
import { Card, CardColor, CardValue } from '../../../../../shared/src/types';

const LIGHT_COLORS: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
const DARK_COLORS: CardColor[] = ['PINK', 'TEAL', 'ORANGE', 'PURPLE'];

// Mapping light colors to dark colors
const COLOR_MAP: Record<CardColor, CardColor> = {
  RED: 'PINK',
  YELLOW: 'TEAL',
  GREEN: 'ORANGE',
  BLUE: 'PURPLE',
  WILD: 'WILD',
  PINK: 'RED',
  TEAL: 'YELLOW',
  ORANGE: 'GREEN',
  PURPLE: 'BLUE'
};

/**
 * Generates 112 double-sided cards for UNO Flip.
 * Each card has light side attributes at root and dark side attributes in darkFace.
 */
export function generateFlipDeck(): Card[] {
  const deck: Card[] = [];

  for (let cIdx = 0; cIdx < LIGHT_COLORS.length; cIdx++) {
    const lightColor = LIGHT_COLORS[cIdx];
    const darkColor = DARK_COLORS[cIdx];

    // Numbers 1-9 (2 of each per color)
    for (let num = 1; num <= 9; num++) {
      const numStr = num.toString() as CardValue;
      for (let i = 0; i < 2; i++) {
        deck.push({
          id: randomUUID(),
          color: lightColor,
          value: numStr,
          darkFace: { color: darkColor, value: numStr }
        });
      }
    }

    // Action cards (2 of each per color)
    // Draw One (Light) -> Draw Five (Dark)
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: randomUUID(),
        color: lightColor,
        value: 'DRAW_ONE',
        darkFace: { color: darkColor, value: 'DRAW_FIVE' }
      });
    }

    // Reverse (Light) -> Reverse (Dark)
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: randomUUID(),
        color: lightColor,
        value: 'REVERSE',
        darkFace: { color: darkColor, value: 'REVERSE' }
      });
    }

    // Skip (Light) -> Skip Everyone (Dark)
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: randomUUID(),
        color: lightColor,
        value: 'SKIP',
        darkFace: { color: darkColor, value: 'SKIP_EVERYONE' }
      });
    }

    // Flip (Light) -> Flip (Dark)
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: randomUUID(),
        color: lightColor,
        value: 'FLIP',
        darkFace: { color: darkColor, value: 'FLIP' }
      });
    }
  }

  // 4 Wild cards (Light Wild -> Dark Wild)
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: randomUUID(),
      color: 'WILD',
      value: 'WILD',
      darkFace: { color: 'WILD', value: 'WILD' }
    });
  }

  // 4 Wild Draw Two (Light) -> Wild Draw Color (Dark)
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: randomUUID(),
      color: 'WILD',
      value: 'WILD_DRAW_TWO',
      darkFace: { color: 'WILD', value: 'WILD_DRAW_COLOR' }
    });
  }

  return Object.freeze(deck) as Card[];
}
