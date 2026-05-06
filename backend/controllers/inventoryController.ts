import { Request, Response } from 'express';
import { PharmacyInventoryModel, UserModel } from '../models';
import { toClient, toId } from '../helpers/utils';

export const getByPharmacy = async (req: Request, res: Response) => {
  try {
    const inventory = await PharmacyInventoryModel.find({ pharmacyId: req.params.id }).sort({ updatedAt: -1 });
    return res.json(inventory.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    if ((req as any).user.role === 'PHARMACIST') {
      const pharmacist = await UserModel.findById((req as any).user.id);
      if (!pharmacist?.pharmacyId || toId(pharmacist.pharmacyId) !== String(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await PharmacyInventoryModel.deleteOne({ _id: itemId, pharmacyId: req.params.id });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete inventory item' });
  }
};

export const updateInventory = async (req: Request, res: Response) => {
  try {
    const { medicationName, stockStatus, quantity, threshold, category, expiryDate } = req.body || {};
    if (!medicationName || !stockStatus) {
      return res.status(400).json({ error: 'medicationName and stockStatus are required' });
    }

    if ((req as any).user.role === 'PHARMACIST') {
      const pharmacist = await UserModel.findById((req as any).user.id);
      if (!pharmacist?.pharmacyId || toId(pharmacist.pharmacyId) !== String(req.params.id)) {
        return res.status(403).json({ error: 'Pharmacist can only update own pharmacy inventory' });
      }
    }

    const inventory = await PharmacyInventoryModel.findOneAndUpdate(
      { pharmacyId: req.params.id, medicationName },
      {
        stockStatus,
        quantity: typeof quantity === 'number' ? Math.max(0, quantity) : undefined,
        threshold: typeof threshold === 'number' ? Math.max(0, threshold) : undefined,
        category: typeof category === 'string' ? category : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    return res.json(toClient(inventory));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update inventory' });
  }
};
