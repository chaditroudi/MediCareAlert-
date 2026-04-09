import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getRecentEvents, getTopicStats, getTotalCount } from '../kafka/eventStore';
import { kafkaConnected, TOPICS } from '../kafka/client';

const router = Router();

// GET /api/kafka/events?limit=100&topic=patient-requests
router.get('/events', authenticate, authorize(['ADMIN']), (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit) || 100, 500);
  const topic = typeof _req.query.topic === 'string' ? _req.query.topic : undefined;
  res.json({ events: getRecentEvents(limit, topic) });
});

// GET /api/kafka/stats
router.get('/stats', authenticate, authorize(['ADMIN']), (_req: Request, res: Response) => {
  res.json({
    connected: kafkaConnected,
    topics: Object.values(TOPICS),
    topicStats: getTopicStats(),
    totalProcessed: getTotalCount(),
  });
});

export default router;
