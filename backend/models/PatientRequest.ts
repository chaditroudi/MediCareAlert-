import mongoose, { Schema } from 'mongoose';

const PatientRequestSchema = new Schema({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  medicationName: { type: String, required: true },
  note: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'out_of_stock', 'resolved'],
    default: 'pending'
  }
}, { timestamps: true });

export const PatientRequestModel = mongoose.model('PatientRequest', PatientRequestSchema);
