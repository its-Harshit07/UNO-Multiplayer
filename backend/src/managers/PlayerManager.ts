import { prisma } from '../prismaClient';

export interface MatchPlayerStats {
  cardsPlayed: number;
  cardsDrawn: number;
  unoCalls: number;
  playedColors: Record<string, number>;
}

export class PlayerManager {
  /**
   * Retrieves an existing player profile by username, or creates a new one.
   */
  public static async getOrCreateProfile(username: string, avatarId: string) {
    let profile = await prisma.playerProfile.findUnique({
      where: { username },
    });

    if (!profile) {
      profile = await prisma.playerProfile.create({
        data: {
          username,
          avatarId,
        },
      });
    } else if (profile.avatarId !== avatarId) {
      // Keep avatar sync
      profile = await prisma.playerProfile.update({
        where: { id: profile.id },
        data: { avatarId },
      });
    }

    return profile;
  }

  /**
   * Updates stats for a player after a match concludes.
   */
  public static async updateStatsAfterMatch(
    profileId: string,
    won: boolean,
    stats: MatchPlayerStats
  ) {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) return;

    const newWins = profile.wins + (won ? 1 : 0);
    const newLosses = profile.losses + (won ? 0 : 1);
    const newStreak = won ? profile.longestStreak + 1 : 0;
    const currentLongestStreak = Math.max(profile.longestStreak, newStreak);

    // Estimate favorite color based on match play counts + historical
    // We increment count of played colors
    const activeFavColor = this.getDominantColor(stats.playedColors) || profile.favoriteColor;

    await prisma.playerProfile.update({
      where: { id: profileId },
      data: {
        wins: newWins,
        losses: newLosses,
        gamesPlayed: profile.gamesPlayed + 1,
        longestStreak: currentLongestStreak,
        favoriteColor: activeFavColor,
      },
    });
  }

  /**
   * Compiles and returns top players sorted by wins.
   */
  public static async getLeaderboard(limit = 10) {
    return prisma.playerProfile.findMany({
      orderBy: { wins: 'desc' },
      take: limit,
    });
  }

  /**
   * Returns a player profile by ID.
   */
  public static async getProfile(profileId: string) {
    return prisma.playerProfile.findUnique({
      where: { id: profileId },
    });
  }

  /**
   * Helper to find the color with the highest usage.
   */
  private static getDominantColor(colorCounts: Record<string, number>): string | null {
    let dominantColor: string | null = null;
    let max = -1;

    for (const [color, count] of Object.entries(colorCounts)) {
      if (color !== 'WILD' && count > max) {
        max = count;
        dominantColor = color;
      }
    }
    return dominantColor;
  }
}
