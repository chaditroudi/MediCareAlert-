import { createServer as createHttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { UserModel } from './models';
import { createChatMessage, markChatRead } from './services/chatService';

const JWT_SECRET = process.env.JWT_SECRET || 'medcare_secret_key_2024';

type SocketUser = {
  id: string;
  role: 'PATIENT' | 'PHARMACIST' | 'ADMIN';
  pharmacyId?: string;
  name?: string;
};

let io: Server | null = null;

export const createRealtimeServer = (app: any) => {
  const httpServer = createHttpServer(app as any);

  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.split(' ')[1]
          : undefined);

      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: SocketUser['role'] };
      const user = await UserModel.findById(decoded.id);
      if (!user) {
        return next(new Error('Unauthorized'));
      }

      (socket.data as any).user = {
        id: decoded.id,
        role: decoded.role,
        pharmacyId: user.pharmacyId ? String(user.pharmacyId) : undefined,
        name: user.name,
      } satisfies SocketUser;

      next();
    } catch (error) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as any).user as SocketUser;
    socket.join(`user:${user.id}`);
    if (user.pharmacyId) {
      socket.join(`pharmacy:${user.pharmacyId}`);
    }

    socket.on('chat:join', async ({ requestId }) => {
      if (!requestId) {
        socket.emit('chat:error', { message: 'requestId is required' });
        return;
      }

      try {
        await markChatRead(requestId, user);
        socket.join(`request:${requestId}`);
        io?.to(`request:${requestId}`).emit('chat:read', {
          requestId,
          userId: user.id,
          role: user.role,
          readAt: new Date().toISOString(),
        });
      } catch (error: any) {
        socket.emit('chat:error', { requestId, message: error.message || 'Unable to join chat room' });
      }
    });

    socket.on('chat:leave', ({ requestId }) => {
      if (requestId) {
        socket.leave(`request:${requestId}`);
      }
    });

    socket.on('chat:send', async ({ requestId, text }) => {
      try {
        const message = await createChatMessage(requestId, user, text);
        emitChatMessage(message);
      } catch (error: any) {
        socket.emit('chat:error', { requestId, message: error.message || 'Unable to send message' });
      }
    });

    socket.on('chat:read', async ({ requestId }) => {
      try {
        await markChatRead(requestId, user);
        io?.to(`request:${requestId}`).emit('chat:read', {
          requestId,
          userId: user.id,
          role: user.role,
          readAt: new Date().toISOString(),
        });
      } catch (error: any) {
        socket.emit('chat:error', { requestId, message: error.message || 'Unable to mark messages as read' });
      }
    });
  });

  return httpServer;
};

export const emitChatMessage = (message: any) => {
  if (!io) {
    return;
  }

  io.to(`request:${message.requestId}`).emit('chat:message', message);
  io.to(`user:${message.patientId}`).emit('chat:message', message);
  io.to(`pharmacy:${message.pharmacyId}`).emit('chat:message', message);
};

export const emitRequestEvent = (event: 'request:created' | 'request:updated', payload: any) => {
  if (!io) {
    return;
  }

  io.to(`user:${payload.patientId}`).emit(event, payload);
  io.to(`pharmacy:${payload.pharmacyId}`).emit(event, payload);
  io.to(`request:${payload.id}`).emit(event, payload);
};

export const getIO = (): Server | null => io;
