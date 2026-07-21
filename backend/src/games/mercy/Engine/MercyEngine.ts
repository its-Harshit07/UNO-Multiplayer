import { Card, CardColor, CardValue, RoomSettings, MatchStatistic } from '../../../../../shared/src/types';
import { Player } from '../../../core/Player';
import { TurnManager } from '../../../core/TurnManager';
import { ChallengeManager } from '../../../core/ChallengeManager';
import { shuffleDeck, getSecureRandomInt } from '../../../core/DeckUtils';
import { cardToString } from '../../../core/CardUtils';
import { IGameEngine, MoveEntry } from '../../../core/IGameEngine';
import { generateMercyDeck } from '../Cards/MercyDeck';
import { isValidMove, hasPlayableCard, getCardScore, getDrawValue, checkMercyRule } from '../Rules/MercyRules';

export class MercyEngine implements IGameEngine {
  public players: Player[] = [];
  public deck: Card[] = [];
  public discardPile: Card[] = [];
  public turnManager: TurnManager;
  public challengeManager: ChallengeManager;

  public currentColor: CardColor = 'RED';
  public previousColorBeforeWD4: CardColor | null = null;
  public winnerId: string | null = null;
  public stateVersion: number = 1;

  public hasDrawnThisTurn: boolean = false;
  public drawnCardThisTurn: Card | null = null;
  public unoCalledBy: Set<string> = new Set();
  public unoVulnerablePlayerId: string | null = null;

  public gameStatus: 'LOBBY' | 'PLAYING' | 'CHALLENGE_WINDOW' | 'SCORING' | 'GAME_OVER' = 'LOBBY';
  public dealerIndex: number = 0;
  public waitingForStartingColor: boolean = false;

  public matchStartTimestamp: number = 0;
  public matchDurationStr: string | null = null;
  public totalMoves: number = 0;

  // Mercy-specific fields
  public eliminatedPlayers: Set<string> = new Set();
  public eliminationOrder: string[] = [];
  public stackedDrawTotal: number = 0;

  // Swap target flags
  public waitingForSwapTarget: boolean = false;
  public swapSrcPlayerId: string | null = null;

  // Roulette flags
  public waitingForRouletteColor: boolean = false;
  public rouletteTargetPlayerId: string | null = null;

  public colorCounters = {
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    YELLOW: 0,
  };

  public movesHistory: MoveEntry[] = [];

  constructor(public readonly roomSettings: RoomSettings) {
    this.turnManager = new TurnManager(0);
    this.challengeManager = new ChallengeManager(); // Unused in Mercy but required by IGameEngine
  }

  /**
   * Asserts the card conservation invariant:
   * Draw Pile + Discard Pile + Hands of all players (including eliminated players' hand cards returned to deck) = exactly 168 cards.
   */
  public verifyCardConservation(): void {
    let total = this.deck.length + this.discardPile.length;
    for (const player of this.players) {
      total += player.hand.length;
    }
    if (total !== 168) {
      throw new Error(`CRITICAL INVARIANT VIOLATION: Card count is ${total} instead of 168.`);
    }
  }

  /**
   * Initializes and starts a new game.
   */
  public startGame(dealerId: string): void {
    if (this.players.length < 2 || this.players.length > 10) {
      throw new Error('Game requires between 2 and 10 players.');
    }

    this.gameStatus = 'PLAYING';
    this.winnerId = null;
    this.stateVersion = 1;
    this.movesHistory = [];
    this.unoCalledBy.clear();
    this.unoVulnerablePlayerId = null;
    this.matchStartTimestamp = Date.now();
    this.matchDurationStr = null;
    this.totalMoves = 0;
    this.eliminatedPlayers.clear();
    this.stackedDrawTotal = 0;
    this.waitingForSwapTarget = false;
    this.swapSrcPlayerId = null;
    this.waitingForRouletteColor = false;
    this.rouletteTargetPlayerId = null;

    this.colorCounters = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 };

    // Determine dealer index
    const dIdx = this.players.findIndex((p) => p.id === dealerId);
    this.dealerIndex = dIdx !== -1 ? dIdx : 0;

    // Reset TurnManager
    this.turnManager.setTotalPlayers(this.players.length);
    this.turnManager.currentPlayerIndex = this.dealerIndex;
    this.turnManager.direction = 1;

    // Generate & Shuffle Deck
    this.deck = shuffleDeck(generateMercyDeck());
    this.discardPile = [];

    // Reset hands
    for (const p of this.players) {
      p.hand = [];
      p.resetStats();
    }

    // Deal 7 cards to each player
    for (let i = 0; i < 7; i++) {
      for (const player of this.players) {
        const card = this.deck.pop()!;
        player.addCard(card);
      }
    }

    // Starting Card: keep flipping until a number card appears (Mattel rules)
    let startingCard = this.deck.pop()!;
    const actionValues: CardValue[] = [
      'SKIP', 'REVERSE', 'DRAW_TWO', 'DRAW_FOUR', 'SKIP_EVERYONE', 'DISCARD_ALL',
      'WILD_COLOR_ROULETTE', 'WILD_REVERSE_DRAW_FOUR', 'WILD_DRAW_SIX', 'WILD_DRAW_TEN'
    ];

    while (actionValues.includes(startingCard.value)) {
      this.deck.push(startingCard);
      this.deck = shuffleDeck(this.deck);
      startingCard = this.deck.pop()!;
    }

    this.discardPile.push(startingCard);
    this.currentColor = startingCard.color;

    // Run Mercy check after dealing (unlikely, but safe)
    this.checkAllPlayersMercyElimination();

    this.verifyCardConservation();

    // First player turn (left of dealer)
    this.turnManager.currentPlayerIndex = this.dealerIndex;
    this.turnManager.next(1);
    this.skipToNextActivePlayer();
  }

  public getCurrentPlayer(): Player {
    return this.players[this.turnManager.currentPlayerIndex];
  }

  public drawCardsForPlayer(player: Player, count: number): Card[] {
    const drawn: Card[] = [];
    player.stats.cardsDrawn += count;
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        this.reshuffleDiscardPile();
      }
      if (this.deck.length > 0) {
        const card = this.deck.pop()!;
        player.addCard(card);
        drawn.push(card);
      }
    }
    this.verifyCardConservation();
    return drawn;
  }

  private reshuffleDiscardPile(): void {
    if (this.discardPile.length <= 1) return;
    const topCard = this.discardPile.pop()!;
    this.deck = shuffleDeck(this.discardPile);
    this.discardPile = [topCard];
  }

  /**
   * Skips to the next player in order who is not eliminated.
   */
  private skipToNextActivePlayer(): void {
    let loopCount = 0;
    while (this.eliminatedPlayers.has(this.getCurrentPlayer().id) && loopCount < this.players.length) {
      this.turnManager.next(1);
      loopCount++;
    }
  }

  /**
   * Checks Mercy Rule (25+ cards) on all players and handles eliminations.
   */
  private checkAllPlayersMercyElimination(): void {
    for (const player of this.players) {
      if (this.eliminatedPlayers.has(player.id)) continue;

      if (checkMercyRule(player.hand.length)) {
        this.eliminatePlayer(player.id);
      }
    }
  }

  /**
   * Eliminates a player under the Mercy Rule. Returns their cards to the draw deck.
   */
  private eliminatePlayer(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || this.eliminatedPlayers.has(playerId)) return;

    const isActivePlayer = this.getCurrentPlayer().id === playerId;

    this.eliminatedPlayers.add(playerId);
    this.eliminationOrder.push(playerId);
    player.isReady = false; // Cannot be ready anymore

    const cardsToReturn = player.hand;
    player.hand = [];

    // Return cards and reshuffle
    this.deck.push(...cardsToReturn);
    this.deck = shuffleDeck(this.deck);

    this.logMove('SYSTEM', 'SYSTEM', 'PASS', null, `Mercy Rule: ${player.username} has 25+ cards and is ELIMINATED!`);

    // Check Win Conditions
    if (this.checkWinConditions()) return;

    if (isActivePlayer) {
      this.hasDrawnThisTurn = false;
      this.drawnCardThisTurn = null;
      this.turnManager.next(1);
      this.skipToNextActivePlayer();
    }
  }

  private checkWinConditions(): boolean {
    const activePlayers = this.players.filter((p) => !this.eliminatedPlayers.has(p.id));
    if (activePlayers.length === 1) {
      this.endGame(activePlayers[0].id);
      return true;
    }
    if (activePlayers.length === 0) {
      // Fallback if somehow everyone gets eliminated simultaneously
      this.endGame(this.players[0].id);
      return true;
    }
    return false;
  }

  public playCard(playerId: string, cardId: string, chosenColor?: CardColor): void {
    if (this.gameStatus !== 'PLAYING') {
      throw new Error('Game is not in playable state.');
    }

    if (this.waitingForSwapTarget || this.waitingForRouletteColor) {
      throw new Error('Game is waiting for special action choice.');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error("It is not this player's turn.");
    }

    const card = currentPlayer.hand.find((c) => c.id === cardId);
    if (!card) {
      throw new Error(`Card not found in hand: cardId=${cardId}, player=${currentPlayer.username}, handSize=${currentPlayer.hand.length}, hasDrawn=${this.hasDrawnThisTurn}, drawnCard=${this.drawnCardThisTurn ? this.drawnCardThisTurn.id : 'null'}, hand=${JSON.stringify(currentPlayer.hand.map(c => ({ id: c.id, val: c.value, col: c.color })))}`);
    }

    const topDiscard = this.discardPile[this.discardPile.length - 1];
    if (!isValidMove(card, topDiscard, this.currentColor, this.stackedDrawTotal)) {
      throw new Error('Card is not playable.');
    }

    // Wild verification (except Color Roulette which is chosen by the target later)
    if (card.color === 'WILD' && card.value !== 'WILD_COLOR_ROULETTE' && !chosenColor) {
      throw new Error('Wild cards require choosing a color.');
    }

    // Remove card from hand
    currentPlayer.removeCard(cardId);
    this.discardPile.push(card);

    currentPlayer.stats.cardsPlayed++;
    if (card.color !== 'WILD') {
      this.colorCounters[card.color as 'RED' | 'BLUE' | 'GREEN' | 'YELLOW']++;
    }

    const prevColor = this.currentColor;
    if (card.color !== 'WILD') {
      this.currentColor = card.color;
    }

    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;

    if (currentPlayer.hand.length !== 1) {
      this.unoVulnerablePlayerId = null;
    }

    this.logMove(currentPlayer.id, currentPlayer.username, 'PLAY', card, chosenColor || null);

    // Stacking logic
    const drawVal = getDrawValue(card);
    if (drawVal > 0) {
      this.stackedDrawTotal += drawVal;
      if (card.color === 'WILD') {
        this.currentColor = chosenColor!;
      }
      
      // Reverse Draw 4 direction swap
      if (card.value === 'WILD_REVERSE_DRAW_FOUR') {
        this.turnManager.reverse();
      }

      // Check game over
      if (currentPlayer.hand.length === 0) {
        this.endGame(currentPlayer.id);
        return;
      }

      // Advance turn to let next player stack or draw
      this.turnManager.next(1);
      this.skipToNextActivePlayer();
      this.totalMoves++;
      this.incrementStateVersion();
      this.verifyCardConservation();
      return;
    }

    // Wild Color Roulette setup
    if (card.value === 'WILD_COLOR_ROULETTE') {
      // Turn advances to next player who must select color and draw
      const nextIdx = this.turnManager.peekNext(1);
      this.turnManager.currentPlayerIndex = nextIdx;
      this.skipToNextActivePlayer();

      const targetPlayer = this.getCurrentPlayer();
      this.waitingForRouletteColor = true;
      this.rouletteTargetPlayerId = targetPlayer.id;
      this.currentColor = 'WILD'; // Indicate wild choice is pending

      this.totalMoves++;
      this.incrementStateVersion();
      this.verifyCardConservation();
      return;
    }

    // 7s Swap setup
    if (card.value === '7') {
      // Check game over first. If hand is empty, player wins immediately without swapping!
      if (currentPlayer.hand.length === 0) {
        this.endGame(currentPlayer.id);
        return;
      }

      this.waitingForSwapTarget = true;
      this.swapSrcPlayerId = currentPlayer.id;

      this.incrementStateVersion();
      this.verifyCardConservation();
      return;
    }

    // 0s Pass rotation
    if (card.value === '0') {
      const activePlayers = this.players.filter((p) => !this.eliminatedPlayers.has(p.id));
      const N = activePlayers.length;
      const hands = activePlayers.map((p) => p.hand);

      for (let i = 0; i < N; i++) {
        // Target index based on direction
        const targetIdx = (i + this.turnManager.direction + N) % N;
        activePlayers[targetIdx].hand = hands[i];
      }

      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', card, '0 card: Hands rotated in direction of play');

      // Check Mercy rules on all players after hand rotation
      this.checkAllPlayersMercyElimination();

      // Check game over (anyone with 0 cards wins, or last standing)
      if (this.checkWinConditions()) return;

      const winners = activePlayers.filter((p) => p.hand.length === 0);
      if (winners.length > 0) {
        this.endGame(winners[0].id); // First winner in turn order
        return;
      }
    }

    // Discard All
    if (card.value === 'DISCARD_ALL') {
      const colorToDiscard = card.color;
      // Filter out all cards matching this color from current player's hand
      const remainingHand: Card[] = [];
      const discardedCards: Card[] = [];

      for (const c of currentPlayer.hand) {
        if (c.color === colorToDiscard) {
          discardedCards.push(c);
        } else {
          remainingHand.push(c);
        }
      }

      currentPlayer.hand = remainingHand;
      this.discardPile.push(...discardedCards);

      this.logMove(
        currentPlayer.id,
        currentPlayer.username,
        'PLAY',
        null,
        `Discarded ${discardedCards.length} cards of color ${colorToDiscard}`
      );
    }

    // Check game over
    if (currentPlayer.hand.length === 0) {
      this.endGame(currentPlayer.id);
      return;
    }

    if (currentPlayer.hand.length === 1 && !this.unoCalledBy.has(currentPlayer.id)) {
      this.unoVulnerablePlayerId = currentPlayer.id;
    }

    this.unoCalledBy.clear();

    // Advance turns
    let skipCount = 1;

    if (card.value === 'SKIP') {
      skipCount = 2;
    } else if (card.value === 'SKIP_EVERYONE') {
      skipCount = 0; // Skips everyone, gets another turn
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', card, `${currentPlayer.username} skips everyone and gets another turn!`);
    } else if (card.value === 'REVERSE') {
      this.turnManager.reverse();
      if (this.players.length === 2) {
        skipCount = 2;
      }
    }

    this.turnManager.next(skipCount);
    this.skipToNextActivePlayer();
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Performs the 7s Hand Swap choice.
   */
  public selectSwapTarget(playerId: string, targetPlayerId: string): void {
    if (!this.waitingForSwapTarget || this.swapSrcPlayerId !== playerId) {
      throw new Error('Not waiting for swap target from this player.');
    }

    const srcPlayer = this.players.find((p) => p.id === playerId);
    const dstPlayer = this.players.find((p) => p.id === targetPlayerId);

    if (!srcPlayer || !dstPlayer) {
      throw new Error('Invalid swap players.');
    }
    if (this.eliminatedPlayers.has(targetPlayerId)) {
      throw new Error('Cannot swap with an eliminated player.');
    }

    // Swap hands
    const temp = srcPlayer.hand;
    srcPlayer.hand = dstPlayer.hand;
    dstPlayer.hand = temp;

    this.logMove(
      srcPlayer.id,
      srcPlayer.username,
      'PLAY',
      null,
      `Swapped hands with ${dstPlayer.username}`
    );

    this.waitingForSwapTarget = false;
    this.swapSrcPlayerId = null;

    // Check Mercy rules (either player could have 25+ cards now!)
    this.checkAllPlayersMercyElimination();

    if (this.checkWinConditions()) return;

    // Check 0 cards win condition
    if (srcPlayer.hand.length === 0) {
      this.endGame(srcPlayer.id);
      return;
    }
    if (dstPlayer.hand.length === 0) {
      this.endGame(dstPlayer.id);
      return;
    }

    // Reset draw flags
    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;

    // Advance turn now
    this.turnManager.next(1);
    this.skipToNextActivePlayer();
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Performs the Wild Color Roulette selection and draws cards.
   */
  public selectRouletteColor(playerId: string, chosenColor: CardColor): void {
    if (!this.waitingForRouletteColor || this.rouletteTargetPlayerId !== playerId) {
      throw new Error('Not waiting for roulette color selection from this player.');
    }

    const targetPlayer = this.players.find((p) => p.id === playerId);
    if (!targetPlayer) return;

    // Draw cards until chosenColor appears. Wild cards do not count.
    const drawnCards: Card[] = [];
    let found = false;

    while (!found) {
      const drawn = this.drawCardsForPlayer(targetPlayer, 1);
      if (drawn.length === 0) break; // Deck empty, break
      drawnCards.push(drawn[0]);

      if (drawn[0].color === chosenColor) {
        found = true;
      }
    }

    this.logMove(
      targetPlayer.id,
      targetPlayer.username,
      'DRAW',
      null,
      `Color Roulette: drew ${drawnCards.length} cards until finding ${chosenColor}`
    );

    this.waitingForRouletteColor = false;
    this.rouletteTargetPlayerId = null;
    this.currentColor = chosenColor;

    // Check Mercy rule on target player
    this.checkAllPlayersMercyElimination();

    if (this.checkWinConditions()) return;

    // Reset draw flags
    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;

    // Next player turn (since target player loses their turn)
    this.turnManager.next(1);
    this.skipToNextActivePlayer();
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  public selectStartingColor(playerId: string, chosenColor: CardColor): void {
    // Unused in Mercy starting cards since they are always number cards, but required by contract
    throw new Error('Starting color choices are not used in UNO No Mercy.');
  }

  /**
   * Handles draw actions.
   * Under Mercy, drawCard behaves differently:
   * 1. If stackedDrawTotal > 0, draw accumulated cards and lose turn.
   * 2. If stackedDrawTotal === 0, draw cards one-by-one until player can play.
   */
  public drawCard(playerId: string): void {
    if (this.gameStatus !== 'PLAYING') {
      throw new Error('Game not in playable state.');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error("It is not this player's turn.");
    }

    const topDiscard = this.discardPile[this.discardPile.length - 1];

    if (this.stackedDrawTotal > 0) {
      // Draw accumulated cards and lose turn
      const penaltyCount = this.stackedDrawTotal;
      this.drawCardsForPlayer(currentPlayer, penaltyCount);
      currentPlayer.stats.penaltyCardsReceived += penaltyCount;
      
      this.logMove(
        currentPlayer.id,
        currentPlayer.username,
        'DRAW',
        null,
        `drew ${penaltyCount} stacked penalty cards`
      );

      this.stackedDrawTotal = 0; // Clear stack

      // Check Mercy
      this.checkAllPlayersMercyElimination();

      if (this.checkWinConditions()) return;

      // Reset draw flags
      this.hasDrawnThisTurn = false;
      this.drawnCardThisTurn = null;

      // Lose turn
      this.turnManager.next(1);
      this.skipToNextActivePlayer();
    } else {
      // Draw until playable
      const drawnCards: Card[] = [];
      let isPlayable = false;

      while (!isPlayable) {
        const drawn = this.drawCardsForPlayer(currentPlayer, 1);
        if (drawn.length === 0) break; // Deck empty, stop
        
        const card = drawn[0];
        drawnCards.push(card);

        if (isValidMove(card, topDiscard, this.currentColor, 0)) {
          isPlayable = true;
          this.drawnCardThisTurn = card;
        }
      }

      currentPlayer.stats.normalDraws += drawnCards.length;
      this.hasDrawnThisTurn = true;

      this.logMove(
        currentPlayer.id,
        currentPlayer.username,
        'DRAW',
        null,
        `drew ${drawnCards.length} cards until finding a playable card`
      );

      // Check Mercy rule
      this.checkAllPlayersMercyElimination();
      this.checkWinConditions();
    }

    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Passing is not allowed under No Mercy rules. You must keep drawing until you play.
   */
  public passTurn(playerId: string): void {
    throw new Error('Passing turns is not permitted under UNO Show\'em No Mercy rules. You must draw until you can play.');
  }

  public callUno(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    if (player.hand.length > 2) {
      throw new Error('You can only call UNO when you have 2 or fewer cards.');
    }

    this.unoCalledBy.add(playerId);
    player.stats.unoCalls++;
    
    if (this.unoVulnerablePlayerId === playerId) {
      this.unoVulnerablePlayerId = null;
    }

    this.totalMoves++;
    this.logMove(player.id, player.username, 'UNO', null, null);
    this.incrementStateVersion();
  }

  public catchUno(catcherId: string, targetId: string): void {
    const target = this.players.find((p) => p.id === targetId);
    if (!target) return;

    if (this.unoVulnerablePlayerId !== targetId) {
      throw new Error('This player is not vulnerable to being caught.');
    }

    // Catch success: target draws 2 penalty cards
    this.drawCardsForPlayer(target, 2);
    target.stats.penaltyCardsReceived += 2;
    this.unoVulnerablePlayerId = null;

    // Check Mercy on target
    this.checkAllPlayersMercyElimination();
    this.checkWinConditions();

    this.totalMoves++;
    const catcher = this.players.find((p) => p.id === catcherId);
    this.logMove(
      catcher?.id || 'SYSTEM',
      catcher?.username || 'SYSTEM',
      'UNO',
      null,
      `Caught ${target.username}! Draws 2 cards penalty`
    );
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  public executeChallenge(challengerId: string, shouldChallenge: boolean): void {
    // Challenge window does not exist in No Mercy since WD4 has been replaced by stacking.
    throw new Error('Challenges are not supported under UNO Show\'em No Mercy.');
  }

  public handleTimeout(): void {
    if (this.gameStatus !== 'PLAYING') return;
    const activePlayer = this.getCurrentPlayer();
    
    this.logMove(
      'SYSTEM',
      activePlayer.username,
      'PASS',
      null,
      'Turn skipped (Timeout)'
    );

    // In timeout, if they have stacked draws, resolve them
    if (this.stackedDrawTotal > 0) {
      this.drawCardsForPlayer(activePlayer, this.stackedDrawTotal);
      this.stackedDrawTotal = 0;
      this.checkAllPlayersMercyElimination();
    } else {
      // Just draw 1 card as punishment for timeout
      this.drawCardsForPlayer(activePlayer, 1);
      this.checkAllPlayersMercyElimination();
    }

    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;
    this.unoCalledBy.clear();
    this.turnManager.next(1);
    this.skipToNextActivePlayer();
    this.checkWinConditions();
    
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  public endGame(winnerId: string): void {
    this.winnerId = winnerId;
    this.gameStatus = 'SCORING';
    
    for (const p of this.players) {
      if (p.id === winnerId) {
        p.finalScore = 0;
      } else {
        p.finalScore = p.hand.reduce((sum, card) => sum + getCardScore(card), 0);
      }
    }
    
    const durationMs = Date.now() - this.matchStartTimestamp;
    const totalSecs = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSecs / 60);
    const seconds = totalSecs % 60;
    this.matchDurationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    this.incrementStateVersion();
  }

  public getMostUsedColor(): CardColor | null {
    const counts = this.colorCounters;
    const colors: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
    
    let maxColor: CardColor | null = null;
    let maxCount = -1;
    
    for (const color of colors) {
      const c = color as keyof typeof this.colorCounters;
      if (counts[c] > maxCount) {
        maxCount = counts[c];
        maxColor = color;
      }
    }
    
    if (maxCount <= 0) return null;
    return maxColor;
  }

  public getMatchStatistics(): MatchStatistic[] | null {
    if ((this.gameStatus !== 'GAME_OVER' && this.gameStatus !== 'SCORING') || !this.winnerId) {
      return null;
    }
    
    // Sort rank: winner first, then active players by score ascending, then eliminated players last (reverse order of elimination)
    const sorted = [...this.players].sort((a, b) => {
      if (a.id === this.winnerId) return -1;
      if (b.id === this.winnerId) return 1;

      const aElim = this.eliminatedPlayers.has(a.id);
      const bElim = this.eliminatedPlayers.has(b.id);
      if (aElim && !bElim) return 1;
      if (!aElim && bElim) return -1;

      if (aElim && bElim) {
        const aIndex = this.eliminationOrder.indexOf(a.id);
        const bIndex = this.eliminationOrder.indexOf(b.id);
        return bIndex - aIndex; // reverse elimination order (last eliminated first)
      }

      return a.finalScore - b.finalScore;
    });
    
    return sorted.map((p, idx) => ({
      playerId: p.id,
      username: p.username,
      rank: idx + 1,
      cardsPlayed: p.stats.cardsPlayed,
      cardsDrawn: p.stats.cardsDrawn,
      score: p.finalScore,
    }));
  }

  public incrementStateVersion(): void {
    this.stateVersion++;
  }

  private logMove(
    playerId: string,
    playerName: string,
    action: 'PLAY' | 'DRAW' | 'PASS' | 'UNO' | 'CHALLENGE' | 'CHALLENGE_RESOLVED',
    card: Card | null,
    color: string | null
  ): void {
    this.movesHistory.push({
      turnIndex: this.movesHistory.length + 1,
      playerId,
      playerName,
      action,
      card: card ? cardToString(card) : null,
      color,
      timestamp: new Date(),
      stateVersion: this.stateVersion,
    });
  }
}
