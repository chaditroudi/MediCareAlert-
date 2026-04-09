import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../controllers/categoryController';

const router = Router();

router.get('/', authenticate as any, authorize(['ADMIN']) as any, ctrl.getAll as any);
router.post('/', authenticate as any, authorize(['ADMIN']) as any, ctrl.create as any);
router.patch('/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.update as any);

export default router;
