import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import connectDB from './config/db';
import routes from './routes';
import { startScheduler } from './services/scheduler';
import { createRealtimeServer } from './socket';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createRealtimeServer(app);

app.use(express.json({ limit: '10mb' }) as any);
app.use(cors() as any);

// Serve uploaded images
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Mount all API routes under /api
app.use('/api', routes);
app.use('/api', (_req, res) => {
  return res.status(404).json({ error: 'API route not found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }

  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 5000;

connectDB()
  .then(async () => {
    startScheduler();
    server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error(err));
