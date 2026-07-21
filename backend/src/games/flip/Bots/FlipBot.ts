import { Card, CardColor } from '../../../../../shared/src/types';
import { Player } from '../../../core/Player';
import { IBotStrategy, BotDecision } from '../../../core/IBotStrategy';
import { getSecureRandomInt } from '../../../core/DeckUtils';
import { isValidMove, getCardFace } from '../Rules/FlipRules';

export class FlipBot implements IBotStrategy {
  public makeTurnDecision(
    bot: Player,
    topDiscard: Card,
    activeColor: CardColor,
    opponents: { id: string; handSize: number }[],
    hasDrawnThisTurn: boolean,
    drawnCard: Card | null = null
  ): BotDecision {
    const hand = bot.hand;
    // Note: The game variant's activeSide can be inferred from the color of cards or opponents' details, 
    // but a cleaner way is checking if activeColor is RED/BLUE/GREEN/YELLOW (LIGHT) or PINK/TEAL/ORANGE/PURPLE (DARK).
    const activeSide: 'LIGHT' | 'DARK' = ['RED', 'BLUE', 'GREEN', 'YELLOW'].includes(activeColor) ? 'LIGHT' : 'DARK';

    // Determine playable cards
    const playableCards = hand.filter((card) => isValidMove(card, topDiscard, activeColor, activeSide));

    const willHaveOneCardLeft = hand.length === 2 && playableCards.length > 0;
    let callUno = false;
    if (willHaveOneCardLeft) {
      const difficulty = bot.botDifficulty || 'EASY';
      const rng = getSecureRandomInt(100);
      if (difficulty === 'HARD') {
        callUno = true;
      } else if (difficulty === 'MEDIUM') {
        callUno = rng < 90;
      } else {
        callUno = rng < 60;
      }
    }

    if (playableCards.length > 0) {
      const difficulty = bot.botDifficulty || 'EASY';
      let cardToPlay: Card;

      if (difficulty === 'EASY') {
        cardToPlay = playableCards[getSecureRandomInt(playableCards.length)];
      } else if (difficulty === 'MEDIUM') {
        // Prefer number cards over action/wild cards
        const numbers = playableCards.filter((c) => {
          const face = getCardFace(c, activeSide);
          return !['SKIP', 'REVERSE', 'DRAW_ONE', 'FLIP', 'WILD', 'WILD_DRAW_TWO', 'DRAW_FIVE', 'SKIP_EVERYONE', 'WILD_DRAW_COLOR'].includes(face.value);
        });
        if (numbers.length > 0) {
          cardToPlay = numbers[getSecureRandomInt(numbers.length)];
        } else {
          cardToPlay = playableCards[getSecureRandomInt(playableCards.length)];
        }
      } else {
        // HARD difficulty
        const nextOpponentHandSize = opponents[0]?.handSize || 99;

        const flips = playableCards.filter((c) => {
          const face = getCardFace(c, activeSide);
          return face.value === 'FLIP';
        });

        const stops = playableCards.filter((c) => {
          const face = getCardFace(c, activeSide);
          return face.value === 'SKIP' || face.value === 'SKIP_EVERYONE' || face.value === 'REVERSE';
        });

        const draws = playableCards.filter((c) => {
          const face = getCardFace(c, activeSide);
          return face.value === 'DRAW_ONE' || face.value === 'DRAW_FIVE';
        });

        const numbers = playableCards.filter((c) => {
          const face = getCardFace(c, activeSide);
          return !['SKIP', 'REVERSE', 'DRAW_ONE', 'FLIP', 'WILD', 'WILD_DRAW_TWO', 'DRAW_FIVE', 'SKIP_EVERYONE', 'WILD_DRAW_COLOR'].includes(face.value);
        });

        const wilds = playableCards.filter((c) => {
          const face = getCardFace(c, activeSide);
          return face.color === 'WILD';
        });

        // Heuristics:
        // 1. If next player is close to winning, play stops or draws
        if (nextOpponentHandSize <= 2 && draws.length > 0) {
          cardToPlay = draws[0];
        } else if (nextOpponentHandSize <= 2 && stops.length > 0) {
          cardToPlay = stops[0];
        } else if (numbers.length > 0) {
          cardToPlay = numbers[getSecureRandomInt(numbers.length)];
        } else if (stops.length > 0) {
          cardToPlay = stops[getSecureRandomInt(stops.length)];
        } else if (draws.length > 0) {
          cardToPlay = draws[getSecureRandomInt(draws.length)];
        } else if (flips.length > 0) {
          cardToPlay = flips[0];
        } else {
          cardToPlay = wilds[0];
        }
      }

      const activeFace = getCardFace(cardToPlay, activeSide);
      let chosenColor: CardColor | undefined;
      if (activeFace.color === 'WILD') {
        chosenColor = this.selectColor(bot, activeSide, bot.botDifficulty || 'EASY');
      }

      return {
        action: 'PLAY',
        cardId: cardToPlay.id,
        chosenColor,
        callUno,
      };
    }

    if (hasDrawnThisTurn) {
      if (drawnCard && isValidMove(drawnCard, topDiscard, activeColor, activeSide)) {
        const drawnFace = getCardFace(drawnCard, activeSide);
        let chosenColor: CardColor | undefined;
        if (drawnFace.color === 'WILD') {
          chosenColor = this.selectColor(bot, activeSide, bot.botDifficulty || 'EASY');
        }
        return {
          action: 'PLAY',
          cardId: drawnCard.id,
          chosenColor,
          callUno: hand.length === 1,
        };
      }
      return { action: 'PASS' };
    } else {
      return { action: 'DRAW' };
    }
  }

  public makeChallengeDecision(bot: Player, challengedPlayerHandSize: number): boolean {
    const difficulty = bot.botDifficulty || 'EASY';
    const rng = getSecureRandomInt(100);

    if (difficulty === 'HARD') {
      return challengedPlayerHandSize <= 4 || rng < 25;
    } else if (difficulty === 'MEDIUM') {
      return rng < 20;
    } else {
      return false;
    }
  }

  private selectColor(bot: Player, activeSide: 'LIGHT' | 'DARK', difficulty: 'EASY' | 'MEDIUM' | 'HARD'): CardColor {
    const colors: CardColor[] = activeSide === 'LIGHT' 
      ? ['RED', 'YELLOW', 'GREEN', 'BLUE'] 
      : ['PINK', 'TEAL', 'ORANGE', 'PURPLE'];

    if (difficulty === 'EASY') {
      return colors[getSecureRandomInt(colors.length)];
    }

    const colorCounts: Record<string, number> = {};
    for (const col of colors) {
      colorCounts[col] = 0;
    }

    for (const card of bot.hand) {
      const face = getCardFace(card, activeSide);
      if (face.color !== 'WILD') {
        const c = face.color as string;
        if (colorCounts[c] !== undefined) {
          colorCounts[c]++;
        }
      }
    }

    let maxColor: CardColor = colors[0];
    let maxCount = -1;
    for (const col of colors) {
      const c = col as string;
      if (colorCounts[c] > maxCount) {
        maxCount = colorCounts[c];
        maxColor = col;
      }
    }

    if (maxCount === 0) {
      return colors[getSecureRandomInt(colors.length)];
    }

    return maxColor;
  }
}
