import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  UserModel,
  PharmacyModel,
  PrescriptionModel,
  MedicationModel,
  PatientRequestModel,
  PharmacyInventoryModel,
  MedicationCategoryModel
} from '../models';
import { toPublicUser, toClient, toId, isEmail } from '../helpers/utils';

// ─── User Account Management ────────────────────────────────────────

export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const users = await UserModel.find({}).sort({ createdAt: -1 });
    return res.json(users.map(toPublicUser));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await UserModel.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const allowedRole = ['PATIENT', 'PHARMACIST', 'ADMIN'].includes(role) ? role : 'PATIENT';
    const hashedPassword = await bcrypt.hash(String(password), 10);

    const user = await UserModel.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password: hashedPassword,
      role: allowedRole,
    });

    return res.status(201).json(toPublicUser(user));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const payload: any = {};
    const { role, isActive, pharmacyId, name, email } = req.body || {};

    if (['PATIENT', 'PHARMACIST', 'ADMIN'].includes(role)) payload.role = role;
    if (typeof isActive === 'boolean') payload.isActive = isActive;
    if (typeof pharmacyId === 'string' || pharmacyId === null) payload.pharmacyId = pharmacyId;
    if (typeof name === 'string' && name.trim()) payload.name = name.trim();
    if (typeof email === 'string' && isEmail(email)) {
      const dup = await UserModel.findOne({ email: email.toLowerCase(), _id: { $ne: req.params.id } });
      if (dup) return res.status(409).json({ error: 'Email already in use' });
      payload.email = email.toLowerCase().trim();
    }

    const user = await UserModel.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json(toPublicUser(user));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update user' });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to reset password' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await MedicationModel.deleteMany({ userId: req.params.id });
    await PrescriptionModel.deleteMany({ userId: req.params.id });
    await PatientRequestModel.deleteMany({ patientId: req.params.id });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ─── Global Statistics ───────────────────────────────────────────────

export const getStats = async (_req: Request, res: Response) => {
  try {
    const [
      totalUsers, activeUsers, patients, pharmacists, admins,
      totalPharmacies, activePharmacies,
      totalPrescriptions, processedPrescriptions,
      activeMeds, totalMeds,
      pendingRequests, totalRequests, confirmedRequests, outOfStockRequests,
      totalInventoryItems, outOfStockItems,
      totalCategories
    ] = await Promise.all([
      UserModel.countDocuments({}),
      UserModel.countDocuments({ isActive: true }),
      UserModel.countDocuments({ role: 'PATIENT' }),
      UserModel.countDocuments({ role: 'PHARMACIST' }),
      UserModel.countDocuments({ role: 'ADMIN' }),
      PharmacyModel.countDocuments({}),
      PharmacyModel.countDocuments({ isActive: true }),
      PrescriptionModel.countDocuments({}),
      PrescriptionModel.countDocuments({ status: 'processed' }),
      MedicationModel.countDocuments({ isActive: true }),
      MedicationModel.countDocuments({}),
      PatientRequestModel.countDocuments({ status: 'pending' }),
      PatientRequestModel.countDocuments({}),
      PatientRequestModel.countDocuments({ status: 'confirmed' }),
      PatientRequestModel.countDocuments({ status: 'out_of_stock' }),
      PharmacyInventoryModel.countDocuments({}),
      PharmacyInventoryModel.countDocuments({ stockStatus: 'out_of_stock' }),
      MedicationCategoryModel.countDocuments({ isActive: true })
    ]);

    // Trend data: registrations per day for last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const userTrend = await UserModel.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const requestTrend = await PatientRequestModel.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const prescriptionTrend = await PrescriptionModel.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Top pharmacies by request count
    const topPharmacies = await PatientRequestModel.aggregate([
      { $group: { _id: '$pharmacyId', requestCount: { $sum: 1 } } },
      { $sort: { requestCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'pharmacies', localField: '_id', foreignField: '_id', as: 'pharmacy' } },
      { $unwind: { path: '$pharmacy', preserveNullAndEmptyArrays: true } },
      { $project: { pharmacyName: '$pharmacy.name', requestCount: 1 } }
    ]);

    // Inventory status breakdown
    const inventoryBreakdown = await PharmacyInventoryModel.aggregate([
      { $group: { _id: '$stockStatus', count: { $sum: 1 } } }
    ]);

    return res.json({
      users: activeUsers,
      totalUsers,
      patients,
      pharmacists,
      admins,
      pharmacies: activePharmacies,
      totalPharmacies,
      prescriptions: totalPrescriptions,
      processedPrescriptions,
      activeMeds,
      totalMeds,
      pendingRequests,
      totalRequests,
      confirmedRequests,
      outOfStockRequests,
      totalInventoryItems,
      outOfStockItems,
      totalCategories,
      userTrend,
      requestTrend,
      prescriptionTrend,
      topPharmacies,
      inventoryBreakdown,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// ─── Pharmacy Supervision ────────────────────────────────────────────

export const getAllPharmacies = async (_req: Request, res: Response) => {
  try {
    const pharmacies = await PharmacyModel.find({}).sort({ createdAt: -1 });
    return res.json(pharmacies.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pharmacies' });
  }
};

export const getPharmacyDetail = async (req: Request, res: Response) => {
  try {
    const pharmacy = await PharmacyModel.findById(req.params.id);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    const [inventory, owner, requestCount] = await Promise.all([
      PharmacyInventoryModel.find({ pharmacyId: req.params.id }).sort({ updatedAt: -1 }),
      UserModel.findOne({ pharmacyId: req.params.id, role: 'PHARMACIST' }),
      PatientRequestModel.countDocuments({ pharmacyId: req.params.id }),
    ]);

    return res.json({
      ...toClient(pharmacy),
      inventory: inventory.map(toClient),
      owner: owner ? toPublicUser(owner) : null,
      requestCount,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pharmacy details' });
  }
};

export const updatePharmacy = async (req: Request, res: Response) => {
  try {
    const allowed = ['name', 'address', 'phone', 'location', 'services', 'isActive'];
    const payload: any = {};
    for (const key of allowed) {
      if ((req.body as any)?.[key] !== undefined) payload[key] = (req.body as any)[key];
    }

    const pharmacy = await PharmacyModel.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    return res.json(toClient(pharmacy));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update pharmacy' });
  }
};

export const deletePharmacy = async (req: Request, res: Response) => {
  try {
    const pharmacy = await PharmacyModel.findByIdAndDelete(req.params.id);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    await PharmacyInventoryModel.deleteMany({ pharmacyId: req.params.id });
    await UserModel.updateMany({ pharmacyId: req.params.id }, { $unset: { pharmacyId: 1 } });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete pharmacy' });
  }
};

export const togglePharmacyActive = async (req: Request, res: Response) => {
  try {
    const pharmacy = await PharmacyModel.findById(req.params.id);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    pharmacy.isActive = !pharmacy.isActive;
    await pharmacy.save();
    return res.json(toClient(pharmacy));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to toggle pharmacy' });
  }
};

// ─── Requests ────────────────────────────────────────────────────────

export const getAllRequests = async (_req: Request, res: Response) => {
  try {
    const requests = await PatientRequestModel.find({}).sort({ createdAt: -1 });
    return res.json(requests.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

// ─── Category Management ─────────────────────────────────────────────

export const getAllCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await MedicationCategoryModel.find({}).sort({ name: 1 });
    return res.json(categories.map(toClient));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existing = await MedicationCategoryModel.findOne({ name: { $regex: `^${String(name).trim()}$`, $options: 'i' } });
    if (existing) {
      return res.status(409).json({ error: 'Category already exists' });
    }

    const category = await MedicationCategoryModel.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
    });
    return res.status(201).json(toClient(category));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create category' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const payload: any = {};
    const { name, description, isActive } = req.body || {};
    if (typeof name === 'string' && name.trim()) payload.name = name.trim();
    if (typeof description === 'string') payload.description = description.trim();
    if (typeof isActive === 'boolean') payload.isActive = isActive;

    const category = await MedicationCategoryModel.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    return res.json(toClient(category));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update category' });
  }
};

export const toggleCategory = async (req: Request, res: Response) => {
  try {
    const category = await MedicationCategoryModel.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    category.isActive = !category.isActive;
    await category.save();
    return res.json(toClient(category));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to toggle category' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const cat = await MedicationCategoryModel.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete category' });
  }
};
