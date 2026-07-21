import { Card, CardColor, CardValue } from '../../../../../shared/src/types';

/**
 * Returns the penalty draw value of a card.
 */
export function getDrawValue(card: Card): number {
  switch (card.value) {
    case 'DRAW_TWO':
      return 2;
    case 'DRAW_FOUR':
    case 'WILD_REVERSE_DRAW_FOUR':
      return 4;
    case 'WILD_DRAW_SIX':
      return 6;
    case 'WILD_DRAW_TEN':
      return 10;
    default:
      return 0;
  }
}

/**
 * Validates if a card can be played on top of the current discard pile under No Mercy rules.
 * Supports Draw Card Stacking logic.
 */
export function isValidMove(
  cardToPlay: Card,
  topDiscardCard: Card,
  activeColor: CardColor,
  stackedDrawTotal: number = 0
): boolean {
  const incomingDrawVal = getDrawValue(cardToPlay);
  const currentDrawVal = getDrawValue(topDiscardCard);

  // If there is an active stack of draw cards
  if (stackedDrawTotal > 0) {
    // Player MUST play a draw card with equal or higher draw value
    if (incomingDrawVal > 0 && incomingDrawVal >= currentDrawVal) {
      return true;
    }
    return false;
  }

  // Normal matching (no active stack)
  // Wild cards (Roulette, Reverse D4, Draw 6, Draw 10) are always playable
  if (cardToPlay.color === 'WILD') {
    return true;
  }

  // Matches the active color
  if (cardToPlay.color === activeColor) {
    return true;
  }

  // Matches the value
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
  activeColor: CardColor,
  stackedDrawTotal: number = 0
): boolean {
  return hand.some((card) => isValidMove(card, topDiscardCard, activeColor, stackedDrawTotal));
}

/**
 * Calculates official score for a single card in No Mercy.
 */
export function getCardScore(card: Card): number {
  if (card.color === 'WILD') {
    return 50;
  }
  
  if (
    card.value === 'SKIP' ||
    card.value === 'REVERSE' ||
    card.value === 'DRAW_TWO' ||
    card.value === 'DRAW_FOUR' ||
    card.value === 'SKIP_EVERYONE' ||
    card.value === 'DISCARD_ALL'
  ) {
    return 20;
  }

  const num = parseInt(card.value, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Returns true if a player is eliminated under the Mercy Rule (25+ cards in hand).
 */
export function checkMercyRule(handSize: number): boolean {
  return handSize >= 25;
}
