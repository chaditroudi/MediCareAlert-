import { Request, Response } from 'express';
import { PharmacyModel, PharmacyInventoryModel, UserModel } from '../models';
import { toClient, toId } from '../helpers/utils';

export const getAll = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const meds = String(req.query.medication || '').trim();
    const filter: any = { isActive: true };

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } }
      ];
    }

    let pharmacies = await PharmacyModel.find(filter).sort({ createdAt: -1 });

    if (meds) {
      const inventory = await PharmacyInventoryModel.find({ medicationName: { $regex: meds, $options: 'i' } });
      const availablePharmacyIds = new Set(
        inventory
          .filter((i) => i.stockStatus !== 'out_of_stock' && i.stockStatus !== 'expired')
          .map((i) => toId(i.pharmacyId))
      );
      pharmacies = pharmacies.filter((p) => availablePharmacyIds.has(toId(p._id)));
    }

    return res.json(pharmacies.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pharmacies' });
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const { name, address, location, phone, services } = req.body || {};

    if (!name || !address || !location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return res.status(400).json({ error: 'name, address and valid location are required' });
    }

    const pharmacy = await PharmacyModel.create({
      name,
      address,
      location,
      phone: phone || '',
      services: Array.isArray(services) ? services : []
    });

    return res.status(201).json(toClient(pharmacy));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create pharmacy' });
  }
};

export const getStockCatalog = async (_req: Request, res: Response) => {
  try {
    const pharmacies = await PharmacyModel.find({ isActive: true }).sort({ name: 1 });
    const pharmacyIds = pharmacies.map((pharmacy) => pharmacy._id);
    const inventory = await PharmacyInventoryModel.find({ pharmacyId: { $in: pharmacyIds } }).sort({ medicationName: 1, updatedAt: -1 });

    const inventoryByPharmacy = inventory.reduce<Record<string, any[]>>((acc, item) => {
      const pharmacyId = toId(item.pharmacyId);
      if (!acc[pharmacyId]) {
        acc[pharmacyId] = [];
      }
      acc[pharmacyId].push(toClient(item));
      return acc;
    }, {});

    return res.json(
      pharmacies.map((pharmacy) => ({
        ...toClient(pharmacy),
        inventory: inventoryByPharmacy[toId(pharmacy._id)] || [],
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pharmacy stock catalog' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const pharmacy = await PharmacyModel.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    return res.json(toClient(pharmacy));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update pharmacy' });
  }
};

/** PATCH /api/pharmacies/mine — pharmacist updates their own pharmacy */
export const updateMine = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.pharmacyId) {
      return res.status(404).json({ error: 'No pharmacy is linked to your account. Ask an admin to assign you one.' });
    }

    const allowed = ['name', 'address', 'phone', 'services', 'location'];
    const update: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const pharmacy = await PharmacyModel.findByIdAndUpdate(user.pharmacyId, update, { new: true });
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    return res.json(toClient(pharmacy));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update pharmacy' });
  }
};

/** GET /api/pharmacies/mine — pharmacist fetches their own pharmacy */
export const getMine = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.pharmacyId) {
      return res.json(null);
    }
    const pharmacy = await PharmacyModel.findById(user.pharmacyId);
    if (!pharmacy) return res.json(null);
    return res.json(toClient(pharmacy));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pharmacy' });
  }
};
