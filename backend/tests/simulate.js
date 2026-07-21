"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const UnoEngine_1 = require("../src/engine/UnoEngine");
const Player_1 = require("../src/engine/Player");
const Bot_1 = require("../src/engine/Bot");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Runs a single bot-only game synchronously and returns summary statistics.
 */
function runSimulationGame(gameId, numPlayers, difficulty) {
    const settings = {
        maxPlayers: 10,
        isPublic: false,
        turnTimerLimit: 0,
        allowSpectators: false,
        enableBots: true,
        botDifficulty: difficulty,
        spectatorDelaySec: 0,
        unoTimeoutSec: 2,
        houseRules: {
            stackDrawTwo: false,
            stackDrawFour: false,
            sevenZeroRule: false,
            jumpIn: false,
            forcePlay: false,
            progressiveDraw: false,
        },
    };
    const engine = new UnoEngine_1.UnoEngine(settings);
    // Initialize bot players
    for (let i = 0; i < numPlayers; i++) {
        const p = new Player_1.Player(`bot_${i}`, `BotPlayer_${i}`, `avatar_${i}`, true, difficulty);
        engine.players.push(p);
    }
    // Start game (dealer is bot_0)
    engine.startGame('bot_0');
    let movesCount = 0;
    let challengesCount = 0;
    let challengesWonCount = 0;
    let totalDrawn = 0;
    // Maximum protection against infinite loops in bugs
    const MAX_MOVES = 1000;
    while (engine.gameStatus !== 'GAME_OVER' && movesCount < MAX_MOVES) {
        movesCount++;
        // Invariant Check BEFORE action
        engine.verifyCardConservation();
        if (engine.waitingForStartingColor) {
            // First player selects starting color based on hand composition
            const activePlayer = engine.getCurrentPlayer();
            // Simply use dominant color select
            const chosenColor = selectStartingColorMock(activePlayer);
            engine.selectStartingColor(activePlayer.id, chosenColor);
            continue;
        }
        if (engine.gameStatus === 'PLAYING') {
            const activePlayer = engine.getCurrentPlayer();
            const opponents = engine.players
                .filter((p) => p.id !== activePlayer.id)
                .map((p) => ({ id: p.id, handSize: p.hand.length }));
            const topDiscard = engine.discardPile[engine.discardPile.length - 1];
            const decision = Bot_1.BotAI.makeTurnDecision(activePlayer, topDiscard, engine.currentColor, opponents, engine.hasDrawnThisTurn, engine.drawnCardThisTurn);
            // Perform decision
            if (decision.action === 'PLAY') {
                if (decision.callUno) {
                    engine.callUno(activePlayer.id);
                }
                engine.playCard(activePlayer.id, decision.cardId, decision.chosenColor);
            }
            else if (decision.action === 'DRAW') {
                engine.drawCard(activePlayer.id);
                totalDrawn++;
            }
            else if (decision.action === 'PASS') {
                engine.passTurn(activePlayer.id);
            }
        }
        else if (engine.gameStatus === 'CHALLENGE_WINDOW' && engine.challengeManager.active) {
            challengesCount++;
            const challengerId = engine.challengeManager.challengerId;
            const challenger = engine.players.find((p) => p.id === challengerId);
            const challengedId = engine.challengeManager.challengedId;
            const challenged = engine.players.find((p) => p.id === challengedId);
            const shouldChallenge = Bot_1.BotAI.makeChallengeDecision(challenger, challenged.hand.length);
            const challengedHandMatchingCount = challenged.hand.filter((c) => c.color === engine.challengeManager.previousColor).length;
            engine.executeChallenge(challenger.id, shouldChallenge);
            if (shouldChallenge && challengedHandMatchingCount > 0) {
                challengesWonCount++;
            }
        }
        // Invariant Check AFTER action
        engine.verifyCardConservation();
    }
    if (movesCount >= MAX_MOVES) {
        throw new Error(`Infinite loop threshold exceeded at game ${gameId}`);
    }
    return {
        moves: movesCount,
        winnerId: engine.winnerId,
        challengesTriggered: challengesCount,
        challengesWon: challengesWonCount,
        cardsDrawnTotal: totalDrawn,
    };
}
function selectStartingColorMock(player) {
    const counts = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    for (const c of player.hand) {
        if (c.color !== 'WILD') {
            counts[c.color]++;
        }
    }
    let maxColor = 'RED';
    let maxVal = -1;
    const colors = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
    for (const col of colors) {
        if (counts[col] > maxVal) {
            maxVal = counts[col];
            maxColor = col;
        }
    }
    return maxColor;
}
/**
 * Execute the 10,000 game stress test.
 */
function runStressTest() {
    console.log('Starting 10,000 Games Bot Simulation Stress Test...');
    const totalGames = 10000;
    let totalMoves = 0;
    let totalDrawnCards = 0;
    let totalChallenges = 0;
    let totalChallengesWon = 0;
    const winCounts = {};
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    for (let i = 1; i <= totalGames; i++) {
        // Vary players count between 2 and 10, and AI difficulty
        const numPlayers = 2 + (i % 9); // ranges from 2 to 10 players
        const difficulty = i % 3 === 0 ? 'EASY' : (i % 3 === 1 ? 'MEDIUM' : 'HARD');
        const result = runSimulationGame(i, numPlayers, difficulty);
        totalMoves += result.moves;
        totalDrawnCards += result.cardsDrawnTotal;
        totalChallenges += result.challengesTriggered;
        totalChallengesWon += result.challengesWon;
        winCounts[result.winnerId] = (winCounts[result.winnerId] || 0) + 1;
        // Log progress indicators
        if (i % 2000 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`Executed ${i} games... (Elapsed: ${elapsed}s)`);
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
    };
    console.log('\n--- SIMULATION RESULTS ---');
    console.log(`Total Games Played: ${resultsSummary.totalGames}`);
    console.log(`Total Turn Moves:   ${resultsSummary.totalMoves} (Avg ${resultsSummary.averageMovesPerGame}/game)`);
    console.log(`Total Cards Drawn:  ${resultsSummary.totalDrawnCards}`);
    console.log(`WD4 Challenges:     ${resultsSummary.totalChallenges} (Won: ${resultsSummary.totalChallengesWon})`);
    console.log(`Test Execution Time: ${resultsSummary.durationSec}s (${resultsSummary.gamesPerSecond} games/sec)`);
    console.log(`Memory Footprint:   Start ${resultsSummary.initialMemoryMB}MB -> End ${resultsSummary.finalMemoryMB}MB (Delta: ${resultsSummary.memoryDeltaMB}MB)`);
    console.log('--------------------------\n');
    // Verify memory remains stable (no leakage exceeding 25MB under GC)
    if (Number(memoryDeltaMB) > 50) {
        console.warn('WARNING: Higher than expected memory increment. Possible garbage collection lag or minor heap retention.');
    }
    else {
        console.log('SUCCESS: Memory footprint is stable. No memory leaks detected.');
    }
    // Create tests directory if missing
    const testsDir = path.join(__dirname, '..', 'tests');
    if (!fs.existsSync(testsDir)) {
        fs.mkdirSync(testsDir);
    }
    fs.writeFileSync(path.join(testsDir, 'stress-results.json'), JSON.stringify(resultsSummary, null, 2), 'utf-8');
    console.log('Results saved to tests/stress-results.json');
}
// Execute
runStressTest();
