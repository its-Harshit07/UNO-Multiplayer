import { Card, CardColor } from '../../../../../shared/src/types';
import { Player } from '../../../core/Player';
import { IBotStrategy, BotDecision } from '../../../core/IBotStrategy';
import { getSecureRandomInt } from '../../../core/DeckUtils';
import { isValidMove } from '../Rules/ClassicRules';

export class ClassicBot implements IBotStrategy {
  /**
   * Evaluates and returns the bot's move during its active turn.
   */
  public makeTurnDecision(
    bot: Player,
    topDiscard: Card,
    activeColor: CardColor,
    opponents: { id: string; handSize: number }[],
    hasDrawnThisTurn: boolean,
    drawnCard: Card | null = null
  ): BotDecision {
    const hand = bot.hand;
    
    // 1. Determine playable cards
    const playableCards = hand.filter((card) => isValidMove(card, topDiscard, activeColor));

    // Determine if the bot should call UNO (if it will have exactly 1 card left after playing)
    const willHaveOneCardLeft = hand.length === 2 && playableCards.length > 0;
    let callUno = false;
    if (willHaveOneCardLeft) {
      const difficulty = bot.botDifficulty || 'EASY';
      const rng = getSecureRandomInt(100);
      if (difficulty === 'HARD') {
        callUno = true; // Hard bot always calls UNO
      } else if (difficulty === 'MEDIUM') {
        callUno = rng < 90; // 90% chance
      } else {
        callUno = rng < 60; // 60% chance
      }
    }

    // 2. Play logic if playable cards exist
    if (playableCards.length > 0) {
      const difficulty = bot.botDifficulty || 'EASY';
      let cardToPlay: Card;

      if (difficulty === 'EASY') {
        // Randomly pick a card
        const index = getSecureRandomInt(playableCards.length);
        cardToPlay = playableCards[index];
      } else if (difficulty === 'MEDIUM') {
        // Prefer number cards over action/wild cards
        const numbers = playableCards.filter((c) => !['SKIP', 'REVERSE', 'DRAW_TWO', 'WILD', 'WILD_DRAW_FOUR'].includes(c.value));
        if (numbers.length > 0) {
          cardToPlay = numbers[getSecureRandomInt(numbers.length)];
        } else {
          cardToPlay = playableCards[getSecureRandomInt(playableCards.length)];
        }
      } else {
        // HARD difficulty
        // Save Wild cards for later unless absolutely necessary.
        // Try to reverse/skip if the next player has a very small hand.
        const nextOpponentHandSize = opponents[0]?.handSize || 99;
        
        const skipsAndReverses = playableCards.filter((c) => c.value === 'SKIP' || c.value === 'REVERSE');
        const drawTwos = playableCards.filter((c) => c.value === 'DRAW_TWO');
        const numbers = playableCards.filter((c) => !['SKIP', 'REVERSE', 'DRAW_TWO', 'WILD', 'WILD_DRAW_FOUR'].includes(c.value));
        const wilds = playableCards.filter((c) => c.color === 'WILD');

        if (nextOpponentHandSize <= 2 && drawTwos.length > 0) {
          // Block next player with +2
          cardToPlay = drawTwos[0];
        } else if (nextOpponentHandSize <= 2 && skipsAndReverses.length > 0) {
          // Skip next player or reverse away from them
          cardToPlay = skipsAndReverses[0];
        } else if (numbers.length > 0) {
          // Play numbers first
          cardToPlay = numbers[getSecureRandomInt(numbers.length)];
        } else if (skipsAndReverses.length > 0) {
          cardToPlay = skipsAndReverses[0];
        } else if (drawTwos.length > 0) {
          cardToPlay = drawTwos[0];
        } else {
          cardToPlay = wilds[0];
        }
      }

      // If playing a Wild card, choose the color
      let chosenColor: CardColor | undefined;
      if (cardToPlay.color === 'WILD') {
        chosenColor = this.selectColor(bot, bot.botDifficulty || 'EASY');
      }

      return {
        action: 'PLAY',
        cardId: cardToPlay.id,
        chosenColor,
        callUno,
      };
    }

    // 3. If no playable cards or if they chose not to play
    if (hasDrawnThisTurn) {
      // If we drew and it's still not playable (or we choose not to play it), pass
      if (drawnCard && isValidMove(drawnCard, topDiscard, activeColor)) {
        // Always play the drawn card if playable
        let chosenColor: CardColor | undefined;
        if (drawnCard.color === 'WILD') {
          chosenColor = this.selectColor(bot, bot.botDifficulty || 'EASY');
        }
        return {
          action: 'PLAY',
          cardId: drawnCard.id,
          chosenColor,
          callUno: hand.length === 1, // Will have 0 cards after playing
        };
      }
      return { action: 'PASS' };
    } else {
      return { action: 'DRAW' };
    }
  }

  /**
   * Decides whether to challenge a Wild Draw 4 played by the previous player.
   */
  public makeChallengeDecision(
    bot: Player,
    challengedPlayerHandSize: number
  ): boolean {
    const difficulty = bot.botDifficulty || 'EASY';
    const rng = getSecureRandomInt(100);

    if (difficulty === 'HARD') {
      // Challenge if the opponent has a small hand, where bluffs are highly probable
      return challengedPlayerHandSize <= 4 || rng < 25;
    } else if (difficulty === 'MEDIUM') {
      // 20% random challenge chance
      return rng < 20;
    } else {
      // Easy bots never challenge
      return false;
    }
  }

  /**
   * Chooses a color for Wild / Wild Draw Four cards.
   * Medium/Hard choose the color they have the most of in their hand.
   */
  private selectColor(bot: Player, difficulty: 'EASY' | 'MEDIUM' | 'HARD'): CardColor {
    const colorCounts: Record<'RED' | 'YELLOW' | 'GREEN' | 'BLUE', number> = {
      RED: 0,
      YELLOW: 0,
      GREEN: 0,
      BLUE: 0,
    };

    for (const card of bot.hand) {
      if (card.color !== 'WILD') {
        const c = card.color as 'RED' | 'YELLOW' | 'GREEN' | 'BLUE';
        if (colorCounts[c] !== undefined) {
          colorCounts[c]++;
        }
      }
    }

    const colors: ('RED' | 'YELLOW' | 'GREEN' | 'BLUE')[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

    if (difficulty === 'EASY') {
      // Return a random color
      return colors[getSecureRandomInt(colors.length)];
    }

    // Find the color with the maximum count
    let maxColor: CardColor = 'RED';
    let maxCount = -1;
    for (const col of colors) {
      if (colorCounts[col] > maxCount) {
        maxCount = colorCounts[col];
        maxColor = col;
      }
    }

    // If they have no colored cards in hand, select a random one
    if (maxCount === 0) {
      return colors[getSecureRandomInt(colors.length)];
    }

    return maxColor;
  }
}
