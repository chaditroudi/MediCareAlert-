import mongoose, { Schema } from 'mongoose';

const PharmacySchema = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  phone: String,
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
  services: [String],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const PharmacyModel = mongoose.model('Pharmacy', PharmacySchema);
