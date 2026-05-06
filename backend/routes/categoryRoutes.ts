import { Router } from 'express';
import * as ctrl from '../controllers/categoryController';

const router = Router();

router.get('/', ctrl.getAll as any);

export default router;
