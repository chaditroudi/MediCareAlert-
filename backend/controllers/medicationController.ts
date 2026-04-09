import { Request, Response } from 'express';
import { MedicationModel } from '../models';
import { toClient, toId } from '../helpers/utils';
import { publishMedicationEvent, publishStockUpdate } from '../kafka';

export const getAll = async (req: Request, res: Response) => {
  try {
    const meds = await MedicationModel.find({ userId: (req as any).user.id }).sort({ createdAt: -1 });
    return res.json(meds.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch medications' });
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ error: 'Medication name is required' });
    }

    const med = await MedicationModel.create({
      ...body,
      userId: (req as any).user.id,
      schedules: Array.isArray(body.schedules) ? body.schedules : ['08:00']
    });

    await publishMedicationEvent( {
  userId: (req as any).user.id,
  medicationId: toId(med._id),
  medicationName: med.name,
  action: 'created',
  schedules: med.schedules,
    })

    return res.status(201).json(toClient(med));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create medication' });
  }
};

export const takeDose = async (req: Request, res: Response) => {
  try {
    const med = await MedicationModel.findOne({ _id: req.params.id, userId: (req as any).user.id });
    if (!med) return res.status(404).json({ error: 'Not found' });

    const now = new Date();
    med.stockCount = Math.max(0, (med.stockCount || 0) - 1);
    med.history.push({
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'taken'
    });

    await med.save();
    await publishMedicationEvent({
  userId: (req as any).user.id,
  medicationId: toId(med._id),
  medicationName: med.name,
  action: 'dose_taken',
});
await publishStockUpdate({
  entityType: 'medication',
  entityId: toId(med._id),
  name: med.name,
  stockCount: med.stockCount,
  threshold: med.threshold,
  userId: (req as any).user.id,
});
    return res.json(toClient(med));
  } catch (err) {
    return res.status(500).json({ error: 'Update failed' });
  }
};

export const updateStock = async (req: Request, res: Response) => {
  try {
    const { stockCount, threshold } = req.body || {};
    const payload: any = {};

    if (typeof stockCount === 'number' && stockCount >= 0) payload.stockCount = stockCount;
    if (typeof threshold === 'number' && threshold >= 0) payload.threshold = threshold;

    const med = await MedicationModel.findOneAndUpdate(
      { _id: req.params.id, userId: (req as any).user.id },
      payload,
      { new: true }
    );
    if (!med) return res.status(404).json({ error: 'Not found' });
    
    await publishStockUpdate({
  entityType: 'medication',
  entityId: toId(med._id),
  name: med.name,
  stockCount: med.stockCount,
  threshold: med.threshold,
  userId: (req as any).user.id,
});
    return res.json(toClient(med));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update stock' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const allowed = ['name', 'dosage', 'frequency', 'durationInDays', 'stockCount', 'threshold', 'schedules', 'isActive'];
    const payload: any = {};
    for (const key of allowed) {
      if ((req.body as any)?.[key] !== undefined) payload[key] = (req.body as any)[key];
    }

    const med = await MedicationModel.findOneAndUpdate(
      { _id: req.params.id, userId: (req as any).user.id },
      payload,
      { new: true }
    );
    if (!med) return res.status(404).json({ error: 'Not found' });
    return res.json(toClient(med));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update medication' });
  }
};

export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!(req as any).file) return res.status(400).json({ error: 'No image provided' });
    const imageUrl = `/uploads/medications/${(req as any).file.filename}`;
    const med = await MedicationModel.findOneAndUpdate(
      { _id: req.params.id, userId: (req as any).user.id },
      { imageUrl },
      { new: true }
    );
    if (!med) return res.status(404).json({ error: 'Not found' });
    return res.json(toClient(med));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to upload image' });
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    await MedicationModel.deleteOne({ _id: req.params.id, userId: (req as any).user.id });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ error: 'Deletion failed' });
  }
};
