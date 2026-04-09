import { Router } from 'express';
import { analyzeWithRAG, chat, chatStream } from '../controllers/ragController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All RAG routes require authentication
router.use(authenticate as any);

router.post('/analyze', analyzeWithRAG as any);
router.post('/chat', chat as any);
router.post('/chat/stream', chatStream as any);

export default router;
