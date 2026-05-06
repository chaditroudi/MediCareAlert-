import { Request, Response } from 'express';
import { MedicationCategoryModel } from '../models';
import { toClient } from '../helpers/utils';

export const getAll = async (_req: Request, res: Response) => {
  try {
    const categories = await MedicationCategoryModel.find({ isActive: true }).sort({ name: 1 });
    return res.json(categories.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
};
