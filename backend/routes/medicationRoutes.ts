import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadMedicationImage } from '../middleware/upload';
import * as ctrl from '../controllers/medicationController';

const router = Router();

router.get('/', authenticate as any, ctrl.getAll as any);
router.post('/', authenticate as any, ctrl.create as any);
router.patch('/:id', authenticate as any, ctrl.update as any);
router.patch('/:id/take', authenticate as any, ctrl.takeDose as any);
router.patch('/:id/stock', authenticate as any, ctrl.updateStock as any);
router.post('/:id/image', authenticate as any, uploadMedicationImage as any, ctrl.uploadImage as any);
router.delete('/:id', authenticate as any, ctrl.remove as any);

export default router;
