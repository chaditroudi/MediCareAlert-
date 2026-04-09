import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['PATIENT', 'PHARMACIST', 'ADMIN'], default: 'PATIENT' },
  isActive: { type: Boolean, default: true },
  location: {
    lat: Number,
    lng: Number
  },
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy' }
}, { timestamps: true });

export const UserModel = mongoose.model('User', UserSchema);
