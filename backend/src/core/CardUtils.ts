import { Card, CardColor, CardValue } from '../../../shared/src/types';
export { Card, CardColor, CardValue };

export function cardToString(card: Card): string {
  if (card.color === 'WILD') {
    return `WILD_${card.value}`;
  }
  const colorCode = card.color[0];
  return `${colorCode}_${card.value}`;
}
