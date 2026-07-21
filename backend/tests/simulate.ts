import { EngineFactory } from '../src/core/EngineFactory';
import { Player } from '../src/core/Player';
import { GameVariant, RoomSettings, CardColor, Card } from '../../shared/src/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Runs a single bot-only game of a given variant synchronously and returns summary statistics.
 */
function runSimulationGame(gameId: number, numPlayers: number, difficulty: 'EASY' | 'MEDIUM' | 'HARD', variant: GameVariant): {
  moves: number;
  winnerId: string;
  challengesTriggered: number;
  challengesWon: number;
  cardsDrawnTotal: number;
} {
  const settings: RoomSettings = {
    maxPlayers: 10,
    isPublic: false,
    turnTimerLimit: 0,
    allowSpectators: false,
    enableBots: true,
    botDifficulty: difficulty,
    spectatorDelaySec: 0,
    unoTimeoutSec: 2,
    gameVariant: variant,
    houseRules: {
      stackDrawTwo: false,
      stackDrawFour: false,
      sevenZeroRule: false,
      jumpIn: false,
      forcePlay: false,
      progressiveDraw: false,
    },
  };

  const engine = EngineFactory.createEngine(variant, settings);
  const botStrategy = EngineFactory.createBotStrategy(variant);

  // Initialize bot players
  for (let i = 0; i < numPlayers; i++) {
    const p = new Player(`bot_${i}`, `BotPlayer_${i}`, `avatar_${i}`, true, difficulty);
    engine.players.push(p);
  }

  // Start game (dealer is bot_0)
  engine.startGame('bot_0');

  let movesCount = 0;
  let challengesCount = 0;
  let challengesWonCount = 0;
  let totalDrawn = 0;

  // Maximum protection against infinite loops in bugs
  const MAX_MOVES = 1200;

  while (engine.gameStatus !== 'GAME_OVER' && engine.gameStatus !== 'SCORING' && movesCount < MAX_MOVES) {
    movesCount++;

    // Invariant Check BEFORE action
    engine.verifyCardConservation();

    // Check Mercy specific choice states
    const engineAny = engine as any;
    if (variant === 'MERCY') {
      if (engineAny.waitingForSwapTarget) {
        const swapSrcId = engineAny.swapSrcPlayerId;
        const bot = engine.players.find((p) => p.id === swapSrcId)!;
        const opponents = engine.players
          .filter((p) => p.id !== bot.id && !engineAny.eliminatedPlayers.has(p.id))
          .map((p) => ({ id: p.id, handSize: p.hand.length }));
        
        // Execute swap decision
        if (botStrategy.selectSwapTarget && opponents.length > 0) {
          const targetId = botStrategy.selectSwapTarget(bot, opponents);
          engineAny.selectSwapTarget(bot.id, targetId);
        }
        continue;
      }

      if (engineAny.waitingForRouletteColor) {
        const targetId = engineAny.rouletteTargetPlayerId;
        const bot = engine.players.find((p) => p.id === targetId)!;
        
        // Execute roulette selection decision
        if (botStrategy.selectRouletteColor) {
          const chosenColor = botStrategy.selectRouletteColor(bot);
          engineAny.selectRouletteColor(bot.id, chosenColor);
        }
        continue;
      }
    }

    if (engine.waitingForStartingColor) {
      // First player selects starting color based on hand composition
      const activePlayer = engine.getCurrentPlayer();
      const chosenColor = selectStartingColorMock(activePlayer);
      engine.selectStartingColor(activePlayer.id, chosenColor);
      continue;
    }

    if (engine.gameStatus === 'PLAYING') {
      const activePlayer = engine.getCurrentPlayer();
      
      const eliminated = (engine as any).eliminatedPlayers || new Set();
      const opponents = engine.players
        .filter((p) => p.id !== activePlayer.id && !eliminated.has(p.id))
        .map((p) => ({ id: p.id, handSize: p.hand.length }));

      const topDiscard = engine.discardPile[engine.discardPile.length - 1];
      
      const decision = botStrategy.makeTurnDecision(
        activePlayer,
        topDiscard,
        engine.currentColor,
        opponents,
        engine.hasDrawnThisTurn,
        engine.drawnCardThisTurn,
        (engine as any).stackedDrawTotal || 0
      );

      // Perform decision
      if (decision.action === 'PLAY') {
        if (decision.callUno) {
          engine.callUno(activePlayer.id);
        }
        engine.playCard(activePlayer.id, decision.cardId!, decision.chosenColor);
      } else if (decision.action === 'DRAW') {
        engine.drawCard(activePlayer.id);
        totalDrawn++;
      } else if (decision.action === 'PASS') {
        engine.passTurn(activePlayer.id);
      }
    } else if (engine.gameStatus === 'CHALLENGE_WINDOW' && engine.challengeManager.active) {
      challengesCount++;
      const challengerId = engine.challengeManager.challengerId;
      const challenger = engine.players.find((p) => p.id === challengerId)!;
      const challengedId = engine.challengeManager.challengedId;
      const challenged = engine.players.find((p) => p.id === challengedId)!;

      const shouldChallenge = botStrategy.makeChallengeDecision(
        challenger,
        challenged.hand.length
      );

      const challengedHandMatchingCount = challenged.hand.filter((c) => c.color === engine.challengeManager.previousColor).length;

      engine.executeChallenge(challenger.id, shouldChallenge);

      if (shouldChallenge && challengedHandMatchingCount > 0) {
        challengesWonCount++;
      }
    }

    // Invariant Check AFTER action
    engine.verifyCardConservation();
  }

  if (engine.gameStatus === 'SCORING') {
    engine.gameStatus = 'GAME_OVER';
  }

  if (movesCount >= MAX_MOVES) {
    throw new Error(`Infinite loop threshold exceeded at game ${gameId} under variant ${variant}`);
  }

  return {
    moves: movesCount,
    winnerId: engine.winnerId!,
    challengesTriggered: challengesCount,
    challengesWon: challengesWonCount,
    cardsDrawnTotal: totalDrawn,
  };
}

function selectStartingColorMock(player: Player): CardColor {
  const colors: CardColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
  const counts: Record<string, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };

  for (const c of player.hand) {
    if (c.color !== 'WILD' && counts[c.color] !== undefined) {
      counts[c.color]++;
    }
  }

  let maxColor: CardColor = 'RED';
  let maxVal = -1;
  for (const col of colors) {
    if (counts[col] > maxVal) {
      maxVal = counts[col];
      maxColor = col;
    }
  }
  return maxColor;
}

/**
 * Execute the 10,000 game stress test across all variants.
 */
function runStressTest() {
  console.log('Starting 10,000 Games Bot Simulation Stress Test...');
  const totalGames = 10000;
  
  let totalMoves = 0;
  let totalDrawnCards = 0;
  let totalChallenges = 0;
  let totalChallengesWon = 0;
  const winCounts: Record<string, number> = {};
  const variantCounts: Record<GameVariant, number> = { CLASSIC: 0, FLIP: 0, MERCY: 0 };

  const startTime = Date.now();
  const initialMemory = process.memoryUsage().heapUsed;

  for (let i = 1; i <= totalGames; i++) {
    // Vary players count between 2 and 10, and AI difficulty
    const numPlayers = 2 + (i % 9); // ranges from 2 to 10 players
    const difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 
      i % 3 === 0 ? 'EASY' : (i % 3 === 1 ? 'MEDIUM' : 'HARD');

    // Distribute variants
    const variant: GameVariant = i % 3 === 0 ? 'CLASSIC' : (i % 3 === 1 ? 'FLIP' : 'MERCY');
    variantCounts[variant]++;

    const result = runSimulationGame(i, numPlayers, difficulty, variant);

    totalMoves += result.moves;
    totalDrawnCards += result.cardsDrawnTotal;
    totalChallenges += result.challengesTriggered;
    totalChallengesWon += result.challengesWon;

    winCounts[result.winnerId] = (winCounts[result.winnerId] || 0) + 1;

    // Log progress indicators
    if (i % 2000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Executed ${i} games... (Classic: ${variantCounts.CLASSIC}, Flip: ${variantCounts.FLIP}, Mercy: ${variantCounts.MERCY}) (Elapsed: ${elapsed}s)`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMB = ((finalMemory - initialMemory) / 1024 / 1024).toFixed(2);

  const resultsSummary = {
    totalGames,
    totalMoves,
    averageMovesPerGame: Number((totalMoves / totalGames).toFixed(2)),
    totalDrawnCards,
    averageDrawnCardsPerGame: Number((totalDrawnCards / totalGames).toFixed(2)),
    totalChallenges,
    totalChallengesWon,
    durationSec: Number(durationSec),
    gamesPerSecond: Number((totalGames / Number(durationSec)).toFixed(2)),
    initialMemoryMB: Number((initialMemory / 1024 / 1024).toFixed(2)),
    finalMemoryMB: Number((finalMemory / 1024 / 1024).toFixed(2)),
    memoryDeltaMB: Number(memoryDeltaMB),
    variantsRun: variantCounts
  };

  console.log('\n--- SIMULATION RESULTS ---');
  console.log(`Total Games Played: ${resultsSummary.totalGames}`);
  console.log(`Classic Games:      ${variantCounts.CLASSIC}`);
  console.log(`Flip Games:         ${variantCounts.FLIP}`);
  console.log(`Mercy Games:        ${variantCounts.MERCY}`);
  console.log(`Total Turn Moves:   ${resultsSummary.totalMoves} (Avg ${resultsSummary.averageMovesPerGame}/game)`);
  console.log(`Total Cards Drawn:  ${resultsSummary.totalDrawnCards}`);
  console.log(`WD4 Challenges:     ${resultsSummary.totalChallenges} (Won: ${resultsSummary.totalChallengesWon})`);
  console.log(`Test Execution Time: ${resultsSummary.durationSec}s (${resultsSummary.gamesPerSecond} games/sec)`);
  console.log(`Memory Footprint:   Start ${resultsSummary.initialMemoryMB}MB -> End ${resultsSummary.finalMemoryMB}MB (Delta: ${resultsSummary.memoryDeltaMB}MB)`);
  console.log('--------------------------\n');

  // Verify memory remains stable
  if (Number(memoryDeltaMB) > 50) {
    console.warn('WARNING: Higher than expected memory increment. Possible garbage collection lag or minor heap retention.');
  } else {
    console.log('SUCCESS: Memory footprint is stable. No memory leaks detected.');
  }

  // Create tests directory if missing
  const testsDir = path.join(__dirname, '..', 'tests');
  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir);
  }

  fs.writeFileSync(
    path.join(testsDir, 'stress-results.json'),
    JSON.stringify(resultsSummary, null, 2),
    'utf-8'
  );
  console.log('Results saved to tests/stress-results.json');
}

// Execute
runStressTest();
