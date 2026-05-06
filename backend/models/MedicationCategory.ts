import mongoose, { Schema } from 'mongoose';

const MedicationCategorySchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const MedicationCategoryModel = mongoose.model('MedicationCategory', MedicationCategorySchema);
