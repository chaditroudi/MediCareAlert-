import { Request, Response } from 'express';
import { MedicationModel } from '../models';
import { toClient } from '../helpers/utils';

const TIME_24H_REGEX = /^\d{2}:\d{2}$/;

const isValidScheduledTime = (value: unknown): value is string =>
  typeof value === 'string' && TIME_24H_REGEX.test(value);

const timeToMinutes = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const getCurrentTimeLabel = (now: Date): string =>
  now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const resolveDoseTime = (
  med: any,
  today: string,
  now: Date,
  requestedTime?: unknown,
): { time?: string; error?: string; duplicate?: boolean } => {
  const handledTimes = new Set(
    (med.history || [])
      .filter((entry: any) => entry.date === today)
      .map((entry: any) => entry.time),
  );

  if (isValidScheduledTime(requestedTime)) {
    if (!(med.schedules || []).includes(requestedTime)) {
      return { error: 'Scheduled time is invalid for this medication' };
    }

    if (handledTimes.has(requestedTime)) {
      return { duplicate: true, time: requestedTime };
    }

    return { time: requestedTime };
  }

  const pendingSchedules = (med.schedules || []).filter(
    (time: string) => !handledTimes.has(time),
  );

  if (pendingSchedules.length === 0) {
    return { duplicate: true };
  }

  if (pendingSchedules.length === 1) {
    return { time: pendingSchedules[0] };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nearestPending = [...pendingSchedules].sort((a, b) => {
    return Math.abs(timeToMinutes(a) - nowMinutes) - Math.abs(timeToMinutes(b) - nowMinutes);
  })[0];

  return { time: nearestPending || getCurrentTimeLabel(now) };
};

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
    const today = now.toISOString().split('T')[0];
    const requestedTime = (req.body as any)?.scheduledTime;
    const resolvedDose = resolveDoseTime(med, today, now, requestedTime);

    if (resolvedDose.error) {
      return res.status(400).json({ error: resolvedDose.error });
    }

    if (resolvedDose.duplicate) {
      return res.status(409).json({
        error: 'This scheduled dose has already been handled today',
        medication: toClient(med),
      });
    }

    med.stockCount = Math.max(0, (med.stockCount || 0) - 1);
    med.history.push({
      date: today,
      time: resolvedDose.time || getCurrentTimeLabel(now),
      status: 'taken'
    });

    await med.save();
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
