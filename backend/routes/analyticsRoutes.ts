import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getFullAnalytics, getPersonalAnalytics } from '../controllers/analyticsController';

const router = Router();

// Admin: full platform analytics
router.get('/admin', authenticate as any, authorize(['ADMIN']) as any, getFullAnalytics as any);

// Patient/Pharmacist: personal analytics
router.get('/me', authenticate as any, getPersonalAnalytics as any);

export default router;
