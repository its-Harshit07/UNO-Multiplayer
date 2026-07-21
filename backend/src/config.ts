import dotenv from 'dotenv';
dotenv.config();

export const PORT = Number(process.env.PORT) || 3000;
export const INVITE_URL_BASE = process.env.INVITE_URL_BASE || '';
export const MAX_CHAT_LENGTH = 120;
export const MAX_PACKETS_PER_SEC = 15;
export const THROTTLE_COOLDOWN_MS = 5000; // Time user gets blocked if packet limit exceeded
export const DISCONNECT_TIMEOUT_MS = 120000; // 120 seconds
