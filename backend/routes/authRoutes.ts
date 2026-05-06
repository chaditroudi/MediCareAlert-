import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadProfileImage } from '../middleware/upload';
import * as ctrl from '../controllers/authController';

const router = Router();

router.post('/register', ctrl.register as any);
router.post('/login', ctrl.login as any);
router.post('/forgot-password', ctrl.forgotPassword as any);
router.post('/reset-password', ctrl.resetPassword as any);
router.get('/me', authenticate as any, ctrl.getMe as any);
router.patch('/me', authenticate as any, ctrl.updateMe as any);
router.post('/me/profile-image', authenticate as any, uploadProfileImage as any, ctrl.uploadMyProfileImage as any);
router.delete('/me/profile-image', authenticate as any, ctrl.deleteMyProfileImage as any);

export default router;
