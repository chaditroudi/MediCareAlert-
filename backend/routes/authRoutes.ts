import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../controllers/authController';

const router = Router();

router.post('/register', ctrl.register as any);
router.post('/login', ctrl.login as any);
router.get('/me', authenticate as any, ctrl.getMe as any);
router.patch('/me', authenticate as any, ctrl.updateMe as any);

export default router;
