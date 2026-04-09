import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadPrescription } from '../middleware/upload';
import * as ctrl from '../controllers/prescriptionController';

const router = Router();

router.post('/', authenticate as any, uploadPrescription as any, ctrl.create as any);
router.get('/', authenticate as any, ctrl.getAll as any);
router.get('/:id', authenticate as any, ctrl.getById as any);

export default router;
