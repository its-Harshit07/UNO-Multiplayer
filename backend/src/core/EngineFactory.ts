import { GameVariant, RoomSettings } from '../../../shared/src/types';
import { IGameEngine } from './IGameEngine';
import { IBotStrategy } from './IBotStrategy';
import { ClassicEngine } from '../games/classic/Engine/ClassicEngine';
import { ClassicBot } from '../games/classic/Bots/ClassicBot';
import { FlipEngine } from '../games/flip/Engine/FlipEngine';
import { FlipBot } from '../games/flip/Bots/FlipBot';
import { MercyEngine } from '../games/mercy/Engine/MercyEngine';
import { MercyBot } from '../games/mercy/Bots/MercyBot';

/**
 * Factory for creating variant-specific game engines and bot strategies.
 * Adding a new variant requires only registering it here.
 */
export class EngineFactory {
  private static engineFactories = new Map<GameVariant, (settings: RoomSettings) => IGameEngine>([
    ['CLASSIC', (settings) => new ClassicEngine(settings)],
    ['FLIP', (settings) => new FlipEngine(settings)],
    ['MERCY', (settings) => new MercyEngine(settings)]
  ]);

  private static botFactories = new Map<GameVariant, () => IBotStrategy>([
    ['CLASSIC', () => new ClassicBot()],
    ['FLIP', () => new FlipBot()],
    ['MERCY', () => new MercyBot()]
  ]);

  /**
   * Register an engine constructor for a game variant.
   */
  public static registerEngine(variant: GameVariant, factory: (settings: RoomSettings) => IGameEngine): void {
    this.engineFactories.set(variant, factory);
  }

  /**
   * Register a bot strategy constructor for a game variant.
   */
  public static registerBot(variant: GameVariant, factory: () => IBotStrategy): void {
    this.botFactories.set(variant, factory);
  }

  /**
   * Creates a game engine for the specified variant.
   */
  public static createEngine(variant: GameVariant, settings: RoomSettings): IGameEngine {
    const factory = this.engineFactories.get(variant);
    if (!factory) {
      throw new Error(`No engine registered for variant: ${variant}`);
    }
    return factory(settings);
  }

  /**
   * Creates a bot strategy for the specified variant.
   */
  public static createBotStrategy(variant: GameVariant): IBotStrategy {
    const factory = this.botFactories.get(variant);
    if (!factory) {
      throw new Error(`No bot strategy registered for variant: ${variant}`);
    }
    return factory();
  }
}

