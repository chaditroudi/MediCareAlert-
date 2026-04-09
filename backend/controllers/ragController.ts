import { Request, Response } from 'express';
import { analyzePrescription, chatWithRAG, streamChatWithRAG, ChatMessage } from '../langchain';

/** POST /api/rag/analyze — Analyze a prescription with RAG */
export const analyzeWithRAG = async (req: Request, res: Response) => {
  try {
    const { medications, doctorName, prescriptionDate } = req.body;
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: 'medications array is required' });
    }

    const analysis = await analyzePrescription({ medications, doctorName, prescriptionDate });
    return res.json({ analysis });
  } catch (err: any) {
    console.error('RAG analysis error:', err);
    return res.status(500).json({ error: 'Failed to analyze prescription', details: err.message });
  }
};

/** POST /api/rag/chat — Chat with medication assistant */
export const chat = async (req: Request, res: Response) => {
  try {
    const { question, history } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question string is required' });
    }

    const safeHistory: ChatMessage[] = Array.isArray(history)
      ? history.filter((m: any) => m.role && m.content).slice(-10)
      : [];

    const answer = await chatWithRAG(question, safeHistory);
    return res.json({ answer });
  } catch (err: any) {
    console.error('RAG chat error:', err);
    return res.status(500).json({ error: 'Failed to get response', details: err.message });
  }
};

/** POST /api/rag/chat/stream — Streaming chat response via SSE */
export const chatStream = async (req: Request, res: Response) => {
  try {
    const { question, history } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question string is required' });
    }

    const safeHistory: ChatMessage[] = Array.isArray(history)
      ? history.filter((m: any) => m.role && m.content).slice(-10)
      : [];

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const generator = streamChatWithRAG(question, safeHistory);
    for await (const chunk of generator) {
      res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('RAG stream error:', err);
    // If headers already sent, just end
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: 'Failed to stream response', details: err.message });
    }
  }
};
