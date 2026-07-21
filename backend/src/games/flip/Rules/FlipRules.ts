import { Card, CardColor, CardValue } from '../../../../../shared/src/types';

/**
 * Returns the color and value of a card face depending on the active side.
 */
export function getCardFace(card: Card, activeSide: 'LIGHT' | 'DARK'): { color: CardColor; value: CardValue } {
  if (activeSide === 'DARK' && card.darkFace) {
    return card.darkFace;
  }
  return { color: card.color, value: card.value };
}

/**
 * Validates if a card can be played on top of the current discard pile under the current side.
 */
export function isValidMove(
  cardToPlay: Card,
  topDiscardCard: Card,
  activeColor: CardColor,
  activeSide: 'LIGHT' | 'DARK'
): boolean {
  const playFace = getCardFace(cardToPlay, activeSide);
  const discardFace = getCardFace(topDiscardCard, activeSide);

  // Wild cards are always playable
  if (playFace.color === 'WILD') {
    return true;
  }

  // Matches active color
  if (playFace.color === activeColor) {
    return true;
  }

  // Matches value on top discard card
  if (playFace.value === discardFace.value) {
    return true;
  }

  return false;
}

/**
 * Checks if a player has any playable cards in their hand.
 */
export function hasPlayableCard(
  hand: Card[],
  topDiscardCard: Card,
  activeColor: CardColor,
  activeSide: 'LIGHT' | 'DARK'
): boolean {
  return hand.some((card) => isValidMove(card, topDiscardCard, activeColor, activeSide));
}

/**
 * Calculates official UNO Flip score for a single card based on the side at which the game ended.
 */
export function getCardScore(card: Card, activeSide: 'LIGHT' | 'DARK'): number {
  const face = getCardFace(card, activeSide);
  
  if (face.color === 'WILD') {
    if (face.value === 'WILD') {
      return 40;
    }
    if (face.value === 'WILD_DRAW_TWO') {
      return 50;
    }
    if (face.value === 'WILD_DRAW_COLOR') {
      return 60;
    }
    return 40;
  }

  if (face.value === 'DRAW_ONE') {
    return 10;
  }
  
  if (
    face.value === 'DRAW_FIVE' ||
    face.value === 'REVERSE' ||
    face.value === 'SKIP' ||
    face.value === 'SKIP_EVERYONE' ||
    face.value === 'FLIP'
  ) {
    return 20;
  }

  const num = parseInt(face.value, 10);
  return isNaN(num) ? 0 : num;
}
