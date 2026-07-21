import { Card, CardColor, CardValue, RoomSettings, MatchStatistic } from '../../../../../shared/src/types';
import { Player } from '../../../core/Player';
import { TurnManager } from '../../../core/TurnManager';
import { ChallengeManager } from '../../../core/ChallengeManager';
import { shuffleDeck, getSecureRandomInt } from '../../../core/DeckUtils';
import { cardToString } from '../../../core/CardUtils';
import { IGameEngine, MoveEntry } from '../../../core/IGameEngine';
import { generateFlipDeck } from '../Cards/FlipDeck';
import { isValidMove, hasPlayableCard, getCardScore, getCardFace } from '../Rules/FlipRules';

export class FlipEngine implements IGameEngine {
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
  
  // Track active side
  public activeSide: 'LIGHT' | 'DARK' = 'LIGHT';

  public colorCounters = {
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    YELLOW: 0,
    // Dark side colors
    PINK: 0,
    TEAL: 0,
    ORANGE: 0,
    PURPLE: 0,
  };

  public movesHistory: MoveEntry[] = [];

  constructor(public readonly roomSettings: RoomSettings) {
    this.turnManager = new TurnManager(0);
    this.challengeManager = new ChallengeManager();
  }

  /**
   * Asserts the card conservation invariant:
   * Draw Pile + Discard Pile + Hands of all players = exactly 112 cards.
   */
  public verifyCardConservation(): void {
    let total = this.deck.length + this.discardPile.length;
    for (const player of this.players) {
      total += player.hand.length;
    }
    if (total !== 112) {
      throw new Error(`CRITICAL INVARIANT VIOLATION: Card count is ${total} instead of 112.`);
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
    this.activeSide = 'LIGHT';
    this.colorCounters = {
      RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0,
      PINK: 0, TEAL: 0, ORANGE: 0, PURPLE: 0,
    };

    // Determine dealer index
    const dIdx = this.players.findIndex((p) => p.id === dealerId);
    this.dealerIndex = dIdx !== -1 ? dIdx : 0;

    // Reset TurnManager
    this.turnManager.setTotalPlayers(this.players.length);
    this.turnManager.currentPlayerIndex = this.dealerIndex;
    this.turnManager.direction = 1;

    // Generate & Shuffle Deck
    this.deck = shuffleDeck(generateFlipDeck());
    this.discardPile = [];

    // Clear hands & stats
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

    // Reveal starting card (Wild Draw Two is put back)
    let startingCard = this.deck.pop()!;
    while (startingCard.value === 'WILD_DRAW_TWO') {
      this.deck.push(startingCard);
      this.deck = shuffleDeck(this.deck);
      startingCard = this.deck.pop()!;
    }

    this.discardPile.push(startingCard);
    this.currentColor = startingCard.color !== 'WILD' ? startingCard.color : 'RED';

    this.verifyCardConservation();

    // Process initial card special effects
    this.applyStartingCardEffects(startingCard);
  }

  private applyStartingCardEffects(startingCard: Card): void {
    const total = this.players.length;

    if (startingCard.value === 'SKIP') {
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(2);
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, 'First card Skip: first player skipped');
    } else if (startingCard.value === 'REVERSE') {
      this.turnManager.reverse();
      if (total === 2) {
        this.turnManager.currentPlayerIndex = this.dealerIndex;
      } else {
        this.turnManager.currentPlayerIndex = this.dealerIndex;
        this.turnManager.next(1);
      }
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, 'First card Reverse: direction reversed');
    } else if (startingCard.value === 'DRAW_ONE') {
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      const skippedPlayerIndex = this.turnManager.peekNext(1);
      const skippedPlayer = this.players[skippedPlayerIndex];
      this.drawCardsForPlayer(skippedPlayer, 1);
      this.logMove(skippedPlayer.id, skippedPlayer.username, 'DRAW', null, 'drew 1 card');
      this.turnManager.next(2);
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, `First card Draw One: ${skippedPlayer.username} draws 1 and loses turn`);
    } else if (startingCard.value === 'FLIP') {
      this.flipGameSide();
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(1);
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, 'First card Flip: Flipped to Dark side');
    } else if (startingCard.value === 'WILD') {
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(1);
      this.waitingForStartingColor = true;
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, `First card Wild: waiting for ${this.getCurrentPlayer().username} to choose color`);
    } else {
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(1);
    }
  }

  /**
   * Swaps the active side between LIGHT and DARK, and recalculates the active color.
   */
  private flipGameSide(): void {
    this.activeSide = this.activeSide === 'LIGHT' ? 'DARK' : 'LIGHT';
    
    // Top card of discard pile determines active color
    const topCard = this.discardPile[this.discardPile.length - 1];
    const face = getCardFace(topCard, this.activeSide);
    
    // Wild on top when flipped? If so, default to RED/PINK.
    this.currentColor = face.color !== 'WILD' ? face.color : (this.activeSide === 'LIGHT' ? 'RED' : 'PINK');
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

  public playCard(playerId: string, cardId: string, chosenColor?: CardColor): void {
    if (this.gameStatus !== 'PLAYING') {
      throw new Error('Game is not in playable state.');
    }

    if (this.waitingForStartingColor) {
      throw new Error('Waiting for the starting color selection first.');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error("It is not this player's turn.");
    }

    const card = currentPlayer.hand.find((c) => c.id === cardId);
    if (!card) {
      throw new Error('Card not found in hand.');
    }

    const topDiscard = this.discardPile[this.discardPile.length - 1];
    if (!isValidMove(card, topDiscard, this.currentColor, this.activeSide)) {
      throw new Error('Card is not playable.');
    }

    const activeFace = getCardFace(card, this.activeSide);

    // Wild verification
    if (activeFace.color === 'WILD' && !chosenColor) {
      throw new Error('Wild cards require choosing a color.');
    }

    // Remove card from hand
    currentPlayer.removeCard(cardId);
    this.discardPile.push(card);

    currentPlayer.stats.cardsPlayed++;
    if (activeFace.color !== 'WILD') {
      const col = activeFace.color as keyof typeof this.colorCounters;
      if (this.colorCounters[col] !== undefined) {
        this.colorCounters[col]++;
      }
    }

    const prevColor = this.currentColor;
    if (activeFace.color !== 'WILD') {
      this.currentColor = activeFace.color;
    }

    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;

    if (currentPlayer.hand.length !== 1) {
      this.unoVulnerablePlayerId = null;
    }

    this.logMove(currentPlayer.id, currentPlayer.username, 'PLAY', card, chosenColor || null);

    // Handle Challenge for Wild Draw Two (Light side)
    if (this.activeSide === 'LIGHT' && card.value === 'WILD_DRAW_TWO') {
      this.currentColor = chosenColor!;
      this.previousColorBeforeWD4 = prevColor;
      this.gameStatus = 'CHALLENGE_WINDOW';

      const nextPlayerIndex = this.turnManager.peekNext(1);
      const nextPlayer = this.players[nextPlayerIndex];

      this.challengeManager.trigger(
        nextPlayer.id,
        currentPlayer.id,
        prevColor,
        card,
        chosenColor!
      );
      
      this.totalMoves++;
      this.incrementStateVersion();
      this.verifyCardConservation();
      return;
    }

    // Wild card play (non-challengeable Wild Draw Color on Dark side)
    if (activeFace.value === 'WILD') {
      this.currentColor = chosenColor!;
    } else if (activeFace.value === 'WILD_DRAW_COLOR') {
      // Wild Draw Color: chosenColor determines target color.
      // Next player draws until they get chosenColor.
      this.currentColor = chosenColor!;
      const nextIdx = this.turnManager.peekNext(1);
      const nextPlayer = this.players[nextIdx];
      
      // Draw until chosenColor appears
      const drawnCards: Card[] = [];
      let found = false;
      while (!found) {
        const drawn = this.drawCardsForPlayer(nextPlayer, 1);
        if (drawn.length === 0) break; // Deck empty, fallback
        drawnCards.push(drawn[0]);
        
        const face = getCardFace(drawn[0], this.activeSide);
        if (face.color === chosenColor || face.color === 'WILD') {
          found = true;
        }
      }

      this.logMove(
        nextPlayer.id,
        nextPlayer.username,
        'DRAW',
        null,
        `drew ${drawnCards.length} cards until finding ${chosenColor}`
      );
    }

    // Check for game over
    if (currentPlayer.hand.length === 0) {
      this.endGame(currentPlayer.id);
      return;
    }

    if (currentPlayer.hand.length === 1 && !this.unoCalledBy.has(currentPlayer.id)) {
      this.unoVulnerablePlayerId = currentPlayer.id;
    }

    this.unoCalledBy.clear();

    // Action Card effects
    let skipCount = 1;

    if (activeFace.value === 'SKIP') {
      skipCount = 2;
    } else if (activeFace.value === 'SKIP_EVERYONE') {
      // Skips everyone else, active player plays again
      skipCount = 0; 
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', card, `${currentPlayer.username} skips everyone else and gets another turn!`);
    } else if (activeFace.value === 'REVERSE') {
      this.turnManager.reverse();
      if (this.players.length === 2) {
        skipCount = 2;
      }
    } else if (activeFace.value === 'DRAW_ONE') {
      const nextIdx = this.turnManager.peekNext(1);
      const nextPlayer = this.players[nextIdx];
      this.drawCardsForPlayer(nextPlayer, 1);
      this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 1 card');
      skipCount = 2;
    } else if (activeFace.value === 'DRAW_FIVE') {
      const nextIdx = this.turnManager.peekNext(1);
      const nextPlayer = this.players[nextIdx];
      this.drawCardsForPlayer(nextPlayer, 5);
      this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 5 cards');
      skipCount = 2;
    } else if (activeFace.value === 'FLIP') {
      this.flipGameSide();
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', card, `Cards flipped! Active side is now ${this.activeSide}. New color is ${this.currentColor}.`);
    } else if (activeFace.value === 'WILD_DRAW_COLOR') {
      // Already drew, next player is skipped
      skipCount = 2;
    }

    this.turnManager.next(skipCount);
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  public selectStartingColor(playerId: string, chosenColor: CardColor): void {
    if (!this.waitingForStartingColor) {
      throw new Error('Not waiting for starting color.');
    }
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error('Only the active player can choose starting color.');
    }

    this.currentColor = chosenColor;
    this.waitingForStartingColor = false;
    this.totalMoves++;
    this.logMove(currentPlayer.id, currentPlayer.username, 'PLAY', null, `Starts color: ${chosenColor}`);
    this.incrementStateVersion();
  }

  public drawCard(playerId: string): void {
    if (this.gameStatus !== 'PLAYING') {
      throw new Error('Game not in playable state.');
    }

    if (this.waitingForStartingColor) {
      throw new Error('Select starting color first.');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error("It is not this player's turn.");
    }

    if (this.hasDrawnThisTurn) {
      throw new Error('You have already drawn a card this turn.');
    }

    const drawn = this.drawCardsForPlayer(currentPlayer, 1);
    currentPlayer.stats.normalDraws++;
    this.hasDrawnThisTurn = true;
    this.drawnCardThisTurn = drawn[0];

    if (currentPlayer.hand.length > 1 && this.unoVulnerablePlayerId === currentPlayer.id) {
      this.unoVulnerablePlayerId = null;
    }

    this.totalMoves++;
    this.logMove(currentPlayer.id, currentPlayer.username, 'DRAW', null, null);
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  public passTurn(playerId: string): void {
    if (this.gameStatus !== 'PLAYING') {
      throw new Error('Game not in playable state.');
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error("It is not this player's turn.");
    }

    if (!this.hasDrawnThisTurn) {
      throw new Error('You must draw a card before passing.');
    }

    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;
    this.unoCalledBy.clear();

    this.turnManager.next(1);
    this.totalMoves++;
    this.logMove(currentPlayer.id, currentPlayer.username, 'PASS', null, null);
    this.incrementStateVersion();
    this.verifyCardConservation();
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

    // Penalty: draw 2 cards
    this.drawCardsForPlayer(target, 2);
    target.stats.penaltyCardsReceived += 2;
    this.unoVulnerablePlayerId = null;

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
    if (this.gameStatus !== 'CHALLENGE_WINDOW' || !this.challengeManager.active) {
      throw new Error('No active challenge window.');
    }

    if (this.challengeManager.challengerId !== challengerId) {
      throw new Error('Only the drawing player can challenge.');
    }

    const nextPlayer = this.players.find((p) => p.id === this.challengeManager.challengerId)!;
    const previousPlayer = this.players.find((p) => p.id === this.challengeManager.challengedId)!;

    if (shouldChallenge) {
      this.logMove(nextPlayer.id, nextPlayer.username, 'CHALLENGE', null, null);
      
      const result = this.challengeManager.resolve(previousPlayer.hand);

      if (result.success) {
        // Guilty: previous player draws 2 cards (penalty)
        this.drawCardsForPlayer(previousPlayer, 2);
        previousPlayer.stats.penaltyCardsReceived += 2;
        nextPlayer.stats.successfulChallenges++;
        this.logMove(previousPlayer.id, previousPlayer.username, 'DRAW', null, 'drew 2 cards');
        this.logMove(nextPlayer.id, nextPlayer.username, 'CHALLENGE_RESOLVED', null, 'Challenge successful');
        
        this.gameStatus = 'PLAYING';
        this.turnManager.currentPlayerIndex = this.players.findIndex((p) => p.id === nextPlayer.id);
      } else {
        // Innocent: Challenger draws 4 cards (2 for card, +2 penalty) and is skipped
        this.drawCardsForPlayer(nextPlayer, 4);
        nextPlayer.stats.penaltyCardsReceived += 4;
        nextPlayer.stats.failedChallenges++;
        this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 4 cards');
        this.logMove(nextPlayer.id, nextPlayer.username, 'CHALLENGE_RESOLVED', null, 'Challenge failed');
        
        this.gameStatus = 'PLAYING';
        this.turnManager.next(2);
      }
    } else {
      // Accept: Challenger draws 2 cards and loses turn
      this.drawCardsForPlayer(nextPlayer, 2);
      nextPlayer.stats.penaltyCardsReceived += 2;
      this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 2 cards');
      
      this.logMove(
        nextPlayer.id,
        nextPlayer.username,
        'CHALLENGE_RESOLVED',
        null,
        `${nextPlayer.username} accepted +2 and loses turn`
      );
      this.gameStatus = 'PLAYING';
      this.turnManager.next(2);
    }

    this.previousColorBeforeWD4 = null;
    this.challengeManager.clear();
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
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

    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;
    this.unoCalledBy.clear();
    this.turnManager.next(1);
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
        p.finalScore = p.hand.reduce((sum, card) => sum + getCardScore(card, this.activeSide), 0);
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
    const colors: CardColor[] = this.activeSide === 'LIGHT' 
      ? ['RED', 'YELLOW', 'GREEN', 'BLUE'] 
      : ['PINK', 'TEAL', 'ORANGE', 'PURPLE'];
    
    let maxColor: CardColor | null = null;
    let maxCount = -1;
    
    for (const color of colors) {
      const c = color as keyof typeof this.colorCounters;
      if (counts[c] !== undefined && counts[c] > maxCount) {
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
    
    const sorted = [...this.players].sort((a, b) => {
      if (a.id === this.winnerId) return -1;
      if (b.id === this.winnerId) return 1;
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
