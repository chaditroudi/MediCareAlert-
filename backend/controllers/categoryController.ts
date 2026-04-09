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

export const create = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const category = await MedicationCategoryModel.create({ name, description: description || '' });
    return res.status(201).json(toClient(category));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create category' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const category = await MedicationCategoryModel.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    return res.json(toClient(category));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update category' });
  }
};
