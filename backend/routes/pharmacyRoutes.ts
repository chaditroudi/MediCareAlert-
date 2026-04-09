import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as pharmacyCtrl from '../controllers/pharmacyController';
import * as inventoryCtrl from '../controllers/inventoryController';

const router = Router();

router.get('/', pharmacyCtrl.getAll as any);
router.post('/', authenticate as any, authorize(['ADMIN']) as any, pharmacyCtrl.create as any);
router.patch('/:id', authenticate as any, authorize(['ADMIN']) as any, pharmacyCtrl.update as any);
router.get('/:id/inventory', inventoryCtrl.getByPharmacy as any);
router.patch('/:id/inventory', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, inventoryCtrl.updateInventory as any);
router.delete('/:id/inventory/:itemId', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, inventoryCtrl.deleteInventoryItem as any);

export default router;
