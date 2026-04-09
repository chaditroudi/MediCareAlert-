import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models';
import { toId, toPublicUser, isEmail } from '../helpers/utils';

const JWT_SECRET = process.env.JWT_SECRET || 'medcare_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export const register = async (req: Request, res: Response) => {
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

    const allowedRole = ['PATIENT', 'PHARMACIST'].includes(role) ? role : 'PATIENT';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await UserModel.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password: hashedPassword,
      role: allowedRole
    });

    const token = jwt.sign({ id: toId(user._id), role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
    return res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    return res.status(400).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    const user = await UserModel.findOne({ email: String(email || '').toLowerCase().trim() });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password || ''), user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: toId(user._id), role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
    return res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Login error' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById((req as any).user.id);
    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(toPublicUser(user));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const updateMe = async (req: Request, res: Response) => {
  try {
    const { name, location, currentPassword, newPassword } = req.body || {};
    const updatePayload: any = {};

    if (typeof name === 'string' && name.trim()) {
      updatePayload.name = name.trim();
    }

    if (
      location &&
      typeof location.lat === 'number' &&
      typeof location.lng === 'number'
    ) {
      updatePayload.location = { lat: location.lat, lng: location.lng };
    }

    // Password change
    if (currentPassword && newPassword) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
      }
      const user = await UserModel.findById((req as any).user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const ok = await bcrypt.compare(String(currentPassword), user.password);
      if (!ok) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
      updatePayload.password = await bcrypt.hash(String(newPassword), 10);
    }

    const user = await UserModel.findByIdAndUpdate((req as any).user.id, updatePayload, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(toPublicUser(user));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update profile' });
  }
};
