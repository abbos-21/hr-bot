import http from 'http';
import { config } from './config';
import { createApp } from './api/server';
import { wsManager } from './websocket';
import { botManager } from './bot/BotManager';
import prisma from './db';

async function main() {
  console.log('Starting HR Recruitment Bot System...');

  // Initialize database
  await prisma.$connect();
  console.log('Database connected');

  // Create Express app
  const app = createApp();
  const server = http.createServer(app);

  // Initialize WebSocket
  wsManager.initialize(server);
  console.log('WebSocket initialized');

  // Initialize bot manager
  await botManager.initialize();
  console.log('Bot manager initialized');

  // Start server
  server.listen(config.port, () => {
    console.log(`\n🚀 Server running on http://localhost:${config.port}`);
    console.log(`📊 Admin panel: http://localhost:${config.port} (in production)`);
    console.log(`🔌 WebSocket: ws://localhost:${config.port}/ws`);
    console.log(`🌍 Environment: ${config.nodeEnv}\n`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await botManager.stopAll();
    await prisma.$disconnect();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
