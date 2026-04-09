import { Request, Response } from 'express';
import { createChatMessage, getChatMessages, markChatRead } from '../services/chatService';

export const getMessages = async (req: Request, res: Response) => {
  try {
    const messages = await getChatMessages(String(req.params.id), (req as any).user);
    return res.json(messages);
  } catch (error: any) {
    if (error.message === 'Request not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
};

export const postMessage = async (req: Request, res: Response) => {
  try {
    const message = await createChatMessage(String(req.params.id), (req as any).user, req.body?.text);
    return res.status(201).json(message);
  } catch (error: any) {
    if (error.message === 'Request not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Message text is required' || error.message === 'Sender not found') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to send chat message' });
  }
};

export const readMessages = async (req: Request, res: Response) => {
  try {
    const result = await markChatRead(String(req.params.id), (req as any).user);
    return res.json(result);
  } catch (error: any) {
    if (error.message === 'Request not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Forbidden') {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to mark chat as read' });
  }
};
