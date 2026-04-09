import { Router } from 'express';
import authRoutes from './authRoutes';
import medicationRoutes from './medicationRoutes';
import pharmacyRoutes from './pharmacyRoutes';
import requestRoutes from './requestRoutes';
import prescriptionRoutes from './prescriptionRoutes';
import adminRoutes from './adminRoutes';
import categoryRoutes from './categoryRoutes';
import analyticsRoutes from './analyticsRoutes';
import kafkaRoutes from './kafkaRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/medications', medicationRoutes);
router.use('/pharmacies', pharmacyRoutes);
router.use('/requests', requestRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/admin', adminRoutes);
router.use('/categories', categoryRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/kafka', kafkaRoutes);

export default router;
