import { Card, CardColor, RoomSettings, MatchStatistic } from '../../../../../shared/src/types';
import { Player } from '../../../core/Player';
import { TurnManager } from '../../../core/TurnManager';
import { ChallengeManager } from '../../../core/ChallengeManager';
import { shuffleDeck, getSecureRandomInt } from '../../../core/DeckUtils';
import { cardToString } from '../../../core/CardUtils';
import { IGameEngine, MoveEntry } from '../../../core/IGameEngine';
import { generateClassicDeck } from '../Cards/ClassicDeck';
import { isValidMove, hasPlayableCard, getCardScore } from '../Rules/ClassicRules';

export class ClassicEngine implements IGameEngine {
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
  public colorCounters = {
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    YELLOW: 0,
  };

  public movesHistory: MoveEntry[] = [];

  constructor(public readonly roomSettings: RoomSettings) {
    this.turnManager = new TurnManager(0);
    this.challengeManager = new ChallengeManager();
  }

  /**
   * Asserts the card conservation invariant:
   * Draw Pile + Discard Pile + Hands of all players = exactly 108 cards.
   */
  public verifyCardConservation(): void {
    let total = this.deck.length + this.discardPile.length;
    for (const player of this.players) {
      total += player.hand.length;
    }
    if (total !== 108) {
      throw new Error(`CRITICAL INVARIANT VIOLATION: Card count is ${total} instead of 108.`);
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
    this.colorCounters = {
      RED: 0,
      BLUE: 0,
      GREEN: 0,
      YELLOW: 0,
    };

    // Determine dealer index
    const dIdx = this.players.findIndex((p) => p.id === dealerId);
    this.dealerIndex = dIdx !== -1 ? dIdx : 0;

    // Reset TurnManager
    this.turnManager.setTotalPlayers(this.players.length);
    this.turnManager.currentPlayerIndex = this.dealerIndex;
    this.turnManager.direction = 1;

    // Generate & Shuffle Deck
    this.deck = shuffleDeck(generateClassicDeck());
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

    // Reveal starting card
    let startingCard = this.deck.pop()!;
    while (startingCard.value === 'WILD_DRAW_FOUR') {
      // Put WD4 back into deck, shuffle, and draw another
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

  /**
   * Applies starting card rules exactly based on the official rulebook.
   */
  private applyStartingCardEffects(startingCard: Card): void {
    const total = this.players.length;

    if (startingCard.value === 'SKIP') {
      // First player (left of dealer) is skipped. Turn advances by 1.
      // So the player to the left of THAT player goes first.
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(2); // Normal next (1) + skip (1) = next(2)
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, 'First card Skip: first player skipped');
    } else if (startingCard.value === 'REVERSE') {
      // Reverse direction immediately.
      this.turnManager.reverse();
      if (total === 2) {
        // In 2-player, Reverse behaves like Skip, so the dealer takes the first turn again.
        this.turnManager.currentPlayerIndex = this.dealerIndex;
      } else {
        // Player next in the new direction takes the first turn.
        // Clockwise next would be dealer + 1, counter-clockwise next is dealer - 1.
        this.turnManager.currentPlayerIndex = this.dealerIndex;
        this.turnManager.next(1);
      }
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, 'First card Reverse: direction reversed');
    } else if (startingCard.value === 'DRAW_TWO') {
      // First player (left of dealer) draws 2 cards and is skipped.
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      const skippedPlayerIndex = this.turnManager.peekNext(1);
      const skippedPlayer = this.players[skippedPlayerIndex];
      this.drawCardsForPlayer(skippedPlayer, 2);
      this.logMove(skippedPlayer.id, skippedPlayer.username, 'DRAW', null, 'drew 2 cards');
      this.turnManager.next(2); // Skip the player who drew
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, `First card Draw Two: ${skippedPlayer.username} draws 2 and loses turn`);
    } else if (startingCard.value === 'WILD') {
      // The player to the left of the dealer chooses the starting color.
      // We set a flag waiting for that player to make the choice before they can play.
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(1);
      this.waitingForStartingColor = true;
      this.logMove('SYSTEM', 'SYSTEM', 'PLAY', startingCard, `First card Wild: waiting for ${this.getCurrentPlayer().username} to choose color`);
    } else {
      // Number card: Normal gameplay starts. Left of dealer plays.
      this.turnManager.currentPlayerIndex = this.dealerIndex;
      this.turnManager.next(1);
    }
  }

  /**
   * Returns the player whose turn it currently is.
   */
  public getCurrentPlayer(): Player {
    return this.players[this.turnManager.currentPlayerIndex];
  }

  /**
   * Draws cards for a player. Automatically handles empty deck reshuffling.
   */
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

  /**
   * Reshuffles discard pile back to draw pile, preserving the top card.
   */
  private reshuffleDiscardPile(): void {
    if (this.discardPile.length <= 1) return;
    const topCard = this.discardPile.pop()!;
    this.deck = shuffleDeck(this.discardPile);
    this.discardPile = [topCard];
  }

  /**
   * Plays a card from the player's hand.
   */
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
    if (!isValidMove(card, topDiscard, this.currentColor)) {
      throw new Error('Card is not playable.');
    }

    // Wild verification
    if (card.color === 'WILD' && !chosenColor) {
      throw new Error('Wild cards require choosing a color.');
    }

    // Remove card from hand
    currentPlayer.removeCard(cardId);
    this.discardPile.push(card);

    currentPlayer.stats.cardsPlayed++;
    if (card.color !== 'WILD') {
      this.colorCounters[card.color as 'RED' | 'BLUE' | 'GREEN' | 'YELLOW']++;
    }

    // Save previous active color for bluffs/challenges
    const prevColor = this.currentColor;
    if (card.color !== 'WILD') {
      this.currentColor = card.color;
    }

    // Reset draw status
    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;

    // Clear target's vulnerability if they play successfully (they had more than 1 card or called UNO)
    if (currentPlayer.hand.length !== 1) {
      this.unoVulnerablePlayerId = null;
    }

    this.logMove(currentPlayer.id, currentPlayer.username, 'PLAY', card, chosenColor || null);

    // If WD4 is played, trigger challenge window immediately
    if (card.value === 'WILD_DRAW_FOUR') {
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

    // If Wild is played, change color
    if (card.value === 'WILD') {
      this.currentColor = chosenColor!;
    }

    // Check for game over
    if (currentPlayer.hand.length === 0) {
      this.endGame(currentPlayer.id);
      return;
    }

    // Handle UNO calls validation:
    // If the player has 1 card left and didn't call UNO this turn, mark them as vulnerable
    if (currentPlayer.hand.length === 1 && !this.unoCalledBy.has(currentPlayer.id)) {
      this.unoVulnerablePlayerId = currentPlayer.id;
    }

    this.unoCalledBy.clear(); // Reset calls for next turn

    // Apply other action card effects
    let skipCount = 1;

    if (card.value === 'SKIP') {
      skipCount = 2; // skips immediate next
    } else if (card.value === 'REVERSE') {
      this.turnManager.reverse();
      if (this.players.length === 2) {
        skipCount = 2; // in 2 players, reverse acts like a Skip
      }
    } else if (card.value === 'DRAW_TWO') {
      const nextIdx = this.turnManager.peekNext(1);
      const nextPlayer = this.players[nextIdx];
      this.drawCardsForPlayer(nextPlayer, 2);
      this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 2 cards');
      skipCount = 2; // Skip turn of the player who drew
    }

    // Advance turn
    this.turnManager.next(skipCount);
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Selects starting color if the starting card was a Wild.
   */
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

  /**
   * Draws a card on the active player's turn.
   */
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

    // Player is no longer vulnerable to UNO call after drawing
    if (currentPlayer.hand.length > 1 && this.unoVulnerablePlayerId === currentPlayer.id) {
      this.unoVulnerablePlayerId = null;
    }

    this.totalMoves++;
    this.logMove(currentPlayer.id, currentPlayer.username, 'DRAW', null, null);
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Passes the turn after drawing a card.
   */
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

    // End turn
    this.hasDrawnThisTurn = false;
    this.drawnCardThisTurn = null;
    this.unoCalledBy.clear();

    this.turnManager.next(1);
    this.totalMoves++;
    this.logMove(currentPlayer.id, currentPlayer.username, 'PASS', null, null);
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Declares UNO by the player. Can be clicked during their turn.
   */
  public callUno(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    // Can only call UNO if they have <= 2 cards
    if (player.hand.length > 2) {
      throw new Error('You can only call UNO when you have 2 or fewer cards.');
    }

    this.unoCalledBy.add(playerId);
    player.stats.unoCalls++;
    
    // If they were marked vulnerable, clear it
    if (this.unoVulnerablePlayerId === playerId) {
      this.unoVulnerablePlayerId = null;
    }

    this.totalMoves++;
    this.logMove(player.id, player.username, 'UNO', null, null);
    this.incrementStateVersion();
  }

  /**
   * Accuses a player of failing to call UNO.
   */
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

  /**
   * Resolves the Wild Draw 4 challenge window.
   */
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
      
      // Perform validation check on previous player's hand
      const result = this.challengeManager.resolve(previousPlayer.hand);

      if (result.success) {
        // Guilty: previous player draws 4 cards. Challenger (nextPlayer) is NOT skipped.
        this.drawCardsForPlayer(previousPlayer, 4);
        previousPlayer.stats.penaltyCardsReceived += 4;
        nextPlayer.stats.successfulChallenges++;
        this.logMove(previousPlayer.id, previousPlayer.username, 'DRAW', null, 'drew 4 cards');
        this.logMove(nextPlayer.id, nextPlayer.username, 'CHALLENGE_RESOLVED', null, 'Challenge successful');
        
        this.gameStatus = 'PLAYING';
        // It stays the nextPlayer's turn (they don't draw and their turn is NOT skipped)
        this.turnManager.currentPlayerIndex = this.players.findIndex((p) => p.id === nextPlayer.id);
      } else {
        // Innocent: Challenger (nextPlayer) draws 6 cards and is skipped.
        this.drawCardsForPlayer(nextPlayer, 6);
        nextPlayer.stats.penaltyCardsReceived += 6;
        nextPlayer.stats.failedChallenges++;
        this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 6 cards');
        this.logMove(nextPlayer.id, nextPlayer.username, 'CHALLENGE_RESOLVED', null, 'Challenge failed');
        
        this.gameStatus = 'PLAYING';
        this.turnManager.next(2); // Skip nextPlayer's turn
      }
    } else {
      // Accept: Challenger draws 4 cards and is skipped.
      this.drawCardsForPlayer(nextPlayer, 4);
      nextPlayer.stats.penaltyCardsReceived += 4;
      this.logMove(nextPlayer.id, nextPlayer.username, 'DRAW', null, 'drew 4 cards');
      this.challengeManager.clear();
      
      this.logMove(
        nextPlayer.id,
        nextPlayer.username,
        'CHALLENGE_RESOLVED',
        null,
        `${nextPlayer.username} accepted +4 and loses turn`
      );
      this.gameStatus = 'PLAYING';
      this.turnManager.next(2); // Skip nextPlayer's turn
    }

    this.previousColorBeforeWD4 = null;
    this.challengeManager.clear();
    this.totalMoves++;
    this.incrementStateVersion();
    this.verifyCardConservation();
  }

  /**
   * Handles a player turn timeout (loses turn, simply advances).
   */
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

  /**
   * Forcefully ends the current game.
   */
  public endGame(winnerId: string): void {
    this.winnerId = winnerId;
    this.gameStatus = 'SCORING';
    
    // Calculate final scores according to official rules
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
    const colors: ('RED' | 'YELLOW' | 'GREEN' | 'BLUE')[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
    
    let maxColor: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | null = null;
    let maxCount = -1;
    
    for (const color of colors) {
      if (counts[color] > maxCount) {
        maxCount = counts[color];
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
    
    // Sort players: winner first, then by finalScore ascending (lowest score wins)
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
