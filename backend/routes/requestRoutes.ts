import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../controllers/requestController';
import * as chatCtrl from '../controllers/chatController';

const router = Router();

router.post('/', authenticate as any, authorize(['PATIENT']) as any, ctrl.create as any);
router.get('/', authenticate as any, ctrl.getAll as any);
router.patch('/:id/status', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, ctrl.updateStatus as any);
router.get('/:id/chat/messages', authenticate as any, chatCtrl.getMessages as any);
router.post('/:id/chat/messages', authenticate as any, authorize(['PATIENT', 'PHARMACIST', 'ADMIN']) as any, chatCtrl.postMessage as any);
router.patch('/:id/chat/read', authenticate as any, authorize(['PATIENT', 'PHARMACIST', 'ADMIN']) as any, chatCtrl.readMessages as any);

export default router;
