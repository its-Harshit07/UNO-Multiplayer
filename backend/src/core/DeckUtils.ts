import { randomBytes, randomUUID } from 'crypto';

/**
 * Generates an unbiased secure random integer in the range [0, max)
 * to eliminate modulo bias.
 */
export function getSecureRandomInt(max: number): number {
  if (max <= 0) return 0;
  const byteCount = Math.ceil(Math.log2(max) / 8);
  const maxVal = Math.pow(256, byteCount);
  const limit = maxVal - (maxVal % max);

  while (true) {
    const bytes = randomBytes(byteCount);
    let value = 0;
    for (let i = 0; i < byteCount; i++) {
      value = (value << 8) + bytes[i];
    }
    if (value < limit) {
      return value % max;
    }
  }
}

/**
 * Shuffles an array using the unbiased Fisher-Yates algorithm.
 */
export function shuffleDeck<T>(deck: T[]): T[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Generates a unique 7-digit room code.
 */
export function generateRoomCode(): string {
  const value = getSecureRandomInt(10000000);
  return value.toString().padStart(7, "0");
}

/**
 * Generates a cryptographically-random UUID for card IDs.
 */
export function generateCardId(): string {
  return randomUUID();
}
