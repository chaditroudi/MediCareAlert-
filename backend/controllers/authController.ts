import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserModel } from '../models';
import { toId, toPublicUser, isEmail } from '../helpers/utils';
import { sendPasswordResetEmail } from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'medcare_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

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

const deleteUploadedFile = (relativeUrl?: string | null) => {
  if (!relativeUrl?.startsWith('/uploads/')) return;
  const relativePath = relativeUrl.replace(/^\/uploads\//, '');
  const fullPath = path.join(UPLOADS_DIR, relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

export const uploadMyProfileImage = async (req: Request, res: Response) => {
  try {
    if (!(req as any).file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const user = await UserModel.findById((req as any).user.id);
    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'User not found' });
    }

    const previousImageUrl = user.profileImageUrl;
    user.profileImageUrl = `/uploads/profiles/${(req as any).file.filename}`;
    await user.save();

    if (previousImageUrl && previousImageUrl !== user.profileImageUrl) {
      deleteUploadedFile(previousImageUrl);
    }

    return res.json(toPublicUser(user));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to upload profile image' });
  }
};

export const deleteMyProfileImage = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById((req as any).user.id);
    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'User not found' });
    }

    const previousImageUrl = user.profileImageUrl;
    user.profileImageUrl = undefined as any;
    await user.save();

    deleteUploadedFile(previousImageUrl);

    return res.json(toPublicUser(user));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to delete profile image' });
  }
};

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email || !isEmail(email)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }

    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return res.json({ message: 'Si un compte existe avec cet e-mail, un lien de réinitialisation a été envoyé.' });
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
    await user.save();

    // Send the reset email with the plain token (hash is stored in DB)
    await sendPasswordResetEmail(user.email, user.name, resetToken);

    return res.json({ message: 'Si un compte existe avec cet e-mail, un lien de réinitialisation a été envoyé.' });
  } catch (err) {
    return res.status(500).json({ error: 'Échec de l\'envoi du lien de réinitialisation' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({ error: 'Token et mot de passe requis' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Hash the incoming token and find the user
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

    const user = await UserModel.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Lien de réinitialisation invalide ou expiré' });
    }

    user.password = await bcrypt.hash(String(password), 10);
    user.resetPasswordToken = null as any;
    user.resetPasswordExpires = null as any;
    await user.save();

    return res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    return res.status(500).json({ error: 'Échec de la réinitialisation du mot de passe' });
  }
};
