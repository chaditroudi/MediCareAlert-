import { Request, Response } from 'express';
import { PharmacyModel, PharmacyInventoryModel } from '../models';
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

export const update = async (req: Request, res: Response) => {
  try {
    const pharmacy = await PharmacyModel.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    return res.json(toClient(pharmacy));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update pharmacy' });
  }
};
