import { Request, Response } from 'express';
import { PrescriptionModel, UserModel } from '../models';
import { toClient } from '../helpers/utils';
import { sendPrescriptionEmail } from '../services/emailService';

export const create = async (req: Request, res: Response) => {
  try {
    let { extractedData, overallConfidence, processingTimeMs, status } = req.body;
    // When sent as FormData, extractedData arrives as a JSON string
    if (typeof extractedData === 'string') {
      try { extractedData = JSON.parse(extractedData); } catch { /* keep as-is */ }
    }
    const imageUrl = (req as any).file
      ? `/uploads/prescriptions/${(req as any).file.filename}`
      : undefined;
    const prescription = await PrescriptionModel.create({
      userId: (req as any).user.id,
      imageUrl,
      extractedData,
      overallConfidence: Number(overallConfidence) || 0,
      processingTimeMs: Number(processingTimeMs) || 0,
      status: status || 'processed',
    });

    // Send prescription confirmation email with image attached
    try {
      const user = await UserModel.findById((req as any).user.id);
      if (user?.email && extractedData?.medications?.length) {
        const medNames = extractedData.medications.map((m: any) => m.name).filter(Boolean);
        await sendPrescriptionEmail(user.email, user.name, medNames, imageUrl);
      }
    } catch (_) { /* email is best-effort */ }

    return res.status(201).json(toClient(prescription));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to save prescription' });
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const prescriptions = await PrescriptionModel.find({ userId: (req as any).user.id }).sort({ createdAt: -1 });
    return res.json(prescriptions.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch prescriptions' });
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const prescription = await PrescriptionModel.findOne({
      _id: req.params.id,
      userId: (req as any).user.id,
    });
    if (!prescription) return res.status(404).json({ error: 'Prescription not found' });
    return res.json(toClient(prescription));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch prescription' });
  }
};
