import mongoose, { Schema } from 'mongoose';

const PrescriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  imageUrl: String,
  extractedData: {
    medications: [{
      name: String,
      dosage: String,
      frequency: String,
      durationInDays: Number,
      instructions: String,
      confidence: Number,
      suggestedSchedules: [String],
    }],
    doctorName: String,
    doctorSpecialty: String,
    prescriptionDate: String,
  },
  overallConfidence: { type: Number, min: 0, max: 1 },
  processingTimeMs: Number,
  status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' }
}, { timestamps: true });

export const PrescriptionModel = mongoose.model('Prescription', PrescriptionSchema);
