import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'benchbook-backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});
