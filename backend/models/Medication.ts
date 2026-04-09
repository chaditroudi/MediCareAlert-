import mongoose, { Schema } from 'mongoose';

const MedicationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  dosage: String,
  frequency: String,
  imageUrl: String,
  durationInDays: { type: Number, default: 7 },
  startDate: { type: Date, default: Date.now },
  stockCount: { type: Number, default: 30 },
  threshold: { type: Number, default: 5 },
  schedules: [{ type: String }],
  isActive: { type: Boolean, default: true },
  history: [{
    date: String,
    time: String,
    status: { type: String, enum: ['taken', 'missed'] }
  }]
}, { timestamps: true });

export const MedicationModel = mongoose.model('Medication', MedicationSchema);
