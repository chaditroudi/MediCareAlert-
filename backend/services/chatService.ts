import { ChatMessageModel, PatientRequestModel, UserModel } from '../models';
import { toClient, toId } from '../helpers/utils';

type AuthUser = {
  id: string;
  role: 'PATIENT' | 'PHARMACIST' | 'ADMIN';
};

const assertRequestAccess = async (requestId: string, user: AuthUser) => {
  const request = await PatientRequestModel.findById(requestId);
  if (!request) {
    throw new Error('Request not found');
  }

  if (user.role === 'ADMIN') {
    return request;
  }

  if (user.role === 'PATIENT' && toId(request.patientId) === user.id) {
    return request;
  }

  if (user.role === 'PHARMACIST') {
    const pharmacist = await UserModel.findById(user.id);
    if (pharmacist?.pharmacyId && toId(pharmacist.pharmacyId) === toId(request.pharmacyId)) {
      return request;
    }
  }

  throw new Error('Forbidden');
};

export const getChatMessages = async (requestId: string, user: AuthUser) => {
  await assertRequestAccess(requestId, user);
  const messages = await ChatMessageModel.find({ requestId }).sort({ createdAt: 1 });
  return messages.map(toClient);
};

export const createChatMessage = async (requestId: string, user: AuthUser, text: string) => {
  const trimmedText = String(text || '').trim();
  if (!trimmedText) {
    throw new Error('Message text is required');
  }

  const request = await assertRequestAccess(requestId, user);
  const sender = await UserModel.findById(user.id);
  if (!sender) {
    throw new Error('Sender not found');
  }

  const message = await ChatMessageModel.create({
    requestId,
    patientId: request.patientId,
    pharmacyId: request.pharmacyId,
    senderId: user.id,
    senderRole: user.role,
    senderName: sender.name,
    text: trimmedText,
    readBy: [
      {
        userId: user.id,
        role: user.role,
        readAt: new Date(),
      },
    ],
  });

  return toClient(message);
};

export const markChatRead = async (requestId: string, user: AuthUser) => {
  await assertRequestAccess(requestId, user);

  await ChatMessageModel.updateMany(
    {
      requestId,
      senderId: { $ne: user.id },
      'readBy.userId': { $ne: user.id },
    },
    {
      $push: {
        readBy: {
          userId: user.id,
          role: user.role,
          readAt: new Date(),
        },
      },
    }
  );

  return { success: true };
};
