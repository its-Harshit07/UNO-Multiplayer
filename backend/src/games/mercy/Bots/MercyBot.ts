import { Card, CardColor } from '../../../../../shared/src/types';
import { Player } from '../../../core/Player';
import { IBotStrategy, BotDecision } from '../../../core/IBotStrategy';
import { getSecureRandomInt } from '../../../core/DeckUtils';
import { isValidMove, getDrawValue } from '../Rules/MercyRules';

export class MercyBot implements IBotStrategy {
  public makeTurnDecision(
    bot: Player,
    topDiscard: Card,
    activeColor: CardColor,
    opponents: { id: string; handSize: number }[],
    hasDrawnThisTurn: boolean,
    drawnCard: Card | null = null,
    stackedDrawTotal: number = 0
  ): BotDecision {
    const hand = bot.hand;
    const playableCards = hand.filter((card) => isValidMove(card, topDiscard, activeColor, stackedDrawTotal));

    // Stacking situation
    if (stackedDrawTotal > 0) {
      if (playableCards.length > 0) {
        // Choose a valid draw card to stack.
        // Hard bots will stack the highest draw card to maximize damage.
        // Easy/Medium will pick a random valid draw card.
        const difficulty = bot.botDifficulty || 'EASY';
        let cardToPlay = playableCards[0];
        
        if (difficulty === 'HARD') {
          // Sort descending by draw value
          playableCards.sort((a, b) => getDrawValue(b) - getDrawValue(a));
          cardToPlay = playableCards[0];
        } else {
          cardToPlay = playableCards[getSecureRandomInt(playableCards.length)];
        }

        let chosenColor: CardColor | undefined;
        if (cardToPlay.color === 'WILD') {
          chosenColor = this.selectColor(bot, bot.botDifficulty || 'EASY');
        }

        return {
          action: 'PLAY',
          cardId: cardToPlay.id,
          chosenColor,
          callUno: hand.length === 2,
        };
      } else {
        // Cannot stack, must draw penalty
        return { action: 'DRAW' };
      }
    }

    // Normal play situation
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
        const numbers = playableCards.filter((c) => !['SKIP', 'REVERSE', 'DRAW_TWO', 'DRAW_FOUR', 'SKIP_EVERYONE', 'DISCARD_ALL'].includes(c.value) && c.color !== 'WILD');
        if (numbers.length > 0) {
          cardToPlay = numbers[getSecureRandomInt(numbers.length)];
        } else {
          cardToPlay = playableCards[getSecureRandomInt(playableCards.length)];
        }
      } else {
        // HARD difficulty
        const nextOpponentHandSize = opponents[0]?.handSize || 99;

        const discards = playableCards.filter((c) => c.value === 'DISCARD_ALL');
        const skips = playableCards.filter((c) => c.value === 'SKIP' || c.value === 'SKIP_EVERYONE' || c.value === 'REVERSE');
        const draws = playableCards.filter((c) => getDrawValue(c) > 0);
        const numbers = playableCards.filter((c) => !['SKIP', 'REVERSE', 'DRAW_TWO', 'DRAW_FOUR', 'SKIP_EVERYONE', 'DISCARD_ALL'].includes(c.value) && c.color !== 'WILD');
        const wilds = playableCards.filter((c) => c.color === 'WILD');

        // Play Discard All first if they have many cards of that color
        if (discards.length > 0) {
          cardToPlay = discards[0];
        } else if (nextOpponentHandSize <= 3 && draws.length > 0) {
          cardToPlay = draws[0]; // Stack penalty on next player
        } else if (nextOpponentHandSize <= 3 && skips.length > 0) {
          cardToPlay = skips[0]; // Skip next player
        } else if (numbers.length > 0) {
          cardToPlay = numbers[getSecureRandomInt(numbers.length)];
        } else if (skips.length > 0) {
          cardToPlay = skips[0];
        } else if (draws.length > 0) {
          cardToPlay = draws[0];
        } else {
          cardToPlay = wilds[0];
        }
      }

      let chosenColor: CardColor | undefined;
      // Note: Color Roulette is chosen by the target player, not the player playing it
      if (cardToPlay.color === 'WILD' && cardToPlay.value !== 'WILD_COLOR_ROULETTE') {
        chosenColor = this.selectColor(bot, bot.botDifficulty || 'EASY');
      }

      return {
        action: 'PLAY',
        cardId: cardToPlay.id,
        chosenColor,
        callUno,
      };
    }

    // No playable card in hand, draw!
    // Note: in Mercy, draw action will draw until playable, and player will play it.
    if (hasDrawnThisTurn) {
      if (drawnCard && isValidMove(drawnCard, topDiscard, activeColor, 0)) {
        let chosenColor: CardColor | undefined;
        if (drawnCard.color === 'WILD' && drawnCard.value !== 'WILD_COLOR_ROULETTE') {
          chosenColor = this.selectColor(bot, bot.botDifficulty || 'EASY');
        }
        return {
          action: 'PLAY',
          cardId: drawnCard.id,
          chosenColor,
          callUno: hand.length === 1,
        };
      }
      // Normally should never pass, but let's have a fallback action
      return { action: 'PASS' };
    } else {
      return { action: 'DRAW' };
    }
  }

  // Not used in No Mercy since challenges are disabled, but required by contract
  public makeChallengeDecision(bot: Player, challengedPlayerHandSize: number): boolean {
    return false;
  }

  /**
   * Selects a swap target (for the 7s Swap card).
   * Chooses the opponent with the smallest hand size.
   */
  public selectSwapTarget(bot: Player, opponents: { id: string; handSize: number }[]): string {
    // Sort opponents by hand size ascending
    const sorted = [...opponents].sort((a, b) => a.handSize - b.handSize);
    return sorted[0].id;
  }

  /**
   * Selects the color to draw for Wild Color Roulette.
   * Chooses the color with the most cards in the bot's hand to minimize drawing risk.
   */
  public selectRouletteColor(bot: Player): CardColor {
    const colors: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
    const counts: Record<string, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    
    for (const card of bot.hand) {
      if (card.color !== 'WILD') {
        counts[card.color]++;
      }
    }

    let maxColor: CardColor = 'RED';
    let maxCount = -1;
    for (const col of colors) {
      if (counts[col] > maxCount) {
        maxCount = counts[col];
        maxColor = col;
      }
    }

    return maxColor;
  }

  private selectColor(bot: Player, difficulty: 'EASY' | 'MEDIUM' | 'HARD'): CardColor {
    const colors: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
    if (difficulty === 'EASY') {
      return colors[getSecureRandomInt(colors.length)];
    }

    const counts: Record<string, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    for (const card of bot.hand) {
      if (card.color !== 'WILD') {
        counts[card.color]++;
      }
    }

    let maxColor: CardColor = 'RED';
    let maxCount = -1;
    for (const col of colors) {
      if (counts[col] > maxCount) {
        maxCount = counts[col];
        maxColor = col;
      }
    }

    if (maxCount === 0) {
      return colors[getSecureRandomInt(colors.length)];
    }

    return maxColor;
  }
}
