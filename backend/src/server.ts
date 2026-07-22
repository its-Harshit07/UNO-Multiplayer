import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PORT } from './config';
import { registerSocketHandlers } from './sockets/socketHandler';
import { prisma } from './prismaClient';

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// Removed global leaderboard API endpoint to enhance privacy

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'https://playuno-hl.vercel.app/',
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`UNO Server listening at http://localhost:${PORT}`);
});

// Graceful cleanup
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});
