import { Card, CardColor } from '../../../../../shared/src/types';

/**
 * Validates if a card can be played on top of the current discard pile.
 * Checks for matching color, matching value, or Wild cards.
 */
export function isValidMove(
  cardToPlay: Card,
  topDiscardCard: Card,
  activeColor: CardColor
): boolean {
  // Wild cards (Wild, Wild Draw Four) are always playable
  if (cardToPlay.color === 'WILD') {
    return true;
  }

  // Card matches the active color chosen/on-top
  if (cardToPlay.color === activeColor) {
    return true;
  }

  // Card matches the numeric/action value
  if (cardToPlay.value === topDiscardCard.value) {
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
  activeColor: CardColor
): boolean {
  return hand.some((card) => isValidMove(card, topDiscardCard, activeColor));
}

/**
 * Calculates official Classic UNO score for a single card.
 */
export function getCardScore(card: Card): number {
  if (card.value === 'WILD' || card.value === 'WILD_DRAW_FOUR') {
    return 50;
  }
  if (card.value === 'SKIP' || card.value === 'REVERSE' || card.value === 'DRAW_TWO') {
    return 20;
  }
  const num = parseInt(card.value, 10);
  return isNaN(num) ? 0 : num;
}
