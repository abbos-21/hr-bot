import express from 'express';
import cors from 'cors';
import path from 'path';
import 'express-async-errors';
import fs from 'fs';

import { config } from '../config';
import authRoutes from './routes/auth';
import botsRoutes from './routes/bots';
import jobsRoutes from './routes/jobs';
import questionsRoutes from './routes/questions';
import candidatesRoutes from './routes/candidates';
import messagesRoutes from './routes/messages';
import analyticsRoutes from './routes/analytics';
import filesRoutes from './routes/files';

export function createApp(): express.Application {
  const app = express();

  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve uploaded files statically (protected in production)
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
  }

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/bots', botsRoutes);
  app.use('/api/jobs', jobsRoutes);
  app.use('/api/questions', questionsRoutes);
  app.use('/api/candidates', candidatesRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/files', filesRoutes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve admin panel in production
  const adminBuildPath = path.join(__dirname, '../../admin/dist');
  if (fs.existsSync(adminBuildPath)) {
    app.use(express.static(adminBuildPath));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(adminBuildPath, 'index.html'));
      }
    });
  }

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('API Error:', err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Internal server error',
    });
  });

  return app;
}
