import mongoose, { Schema } from 'mongoose';

const ChatMessageSchema = new Schema({
  requestId: { type: Schema.Types.ObjectId, ref: 'PatientRequest', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['PATIENT', 'PHARMACIST', 'ADMIN'], required: true },
  senderName: { type: String, required: true },
  text: { type: String, required: true, trim: true },
  readBy: [
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String, enum: ['PATIENT', 'PHARMACIST', 'ADMIN'], required: true },
      readAt: { type: Date, required: true },
    },
  ],
}, { timestamps: true });

export const ChatMessageModel = mongoose.model('ChatMessage', ChatMessageSchema);
