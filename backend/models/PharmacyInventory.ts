import mongoose, { Schema } from 'mongoose';

const PharmacyInventorySchema = new Schema({
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  medicationName: { type: String, required: true },
  stockStatus: {
    type: String,
    enum: ['available', 'low', 'out_of_stock', 'expired'],
    default: 'available'
  },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

export const PharmacyInventoryModel = mongoose.model('PharmacyInventory', PharmacyInventorySchema);
