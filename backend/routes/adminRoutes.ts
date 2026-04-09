import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../controllers/adminController';

const router = Router();

// User Account Management
router.get('/users', authenticate as any, authorize(['ADMIN']) as any, ctrl.getAllUsers as any);
router.post('/users', authenticate as any, authorize(['ADMIN']) as any, ctrl.createUser as any);
router.patch('/users/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.updateUser as any);
router.patch('/users/:id/reset-password', authenticate as any, authorize(['ADMIN']) as any, ctrl.resetUserPassword as any);
router.delete('/users/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.deleteUser as any);

// Global Statistics
router.get('/stats', authenticate as any, authorize(['ADMIN']) as any, ctrl.getStats as any);

// Pharmacy Supervision
router.get('/pharmacies', authenticate as any, authorize(['ADMIN']) as any, ctrl.getAllPharmacies as any);
router.get('/pharmacies/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.getPharmacyDetail as any);
router.patch('/pharmacies/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.updatePharmacy as any);
router.patch('/pharmacies/:id/toggle', authenticate as any, authorize(['ADMIN']) as any, ctrl.togglePharmacyActive as any);
router.delete('/pharmacies/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.deletePharmacy as any);

// Requests
router.get('/requests', authenticate as any, authorize(['ADMIN']) as any, ctrl.getAllRequests as any);

// Category Management
router.get('/categories', authenticate as any, authorize(['ADMIN']) as any, ctrl.getAllCategories as any);
router.post('/categories', authenticate as any, authorize(['ADMIN']) as any, ctrl.createCategory as any);
router.patch('/categories/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.updateCategory as any);
router.patch('/categories/:id/toggle', authenticate as any, authorize(['ADMIN']) as any, ctrl.toggleCategory as any);
router.delete('/categories/:id', authenticate as any, authorize(['ADMIN']) as any, ctrl.deleteCategory as any);

export default router;
