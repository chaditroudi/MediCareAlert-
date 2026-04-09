// backend/kafka/index.ts
import { producer, kafka, TOPICS, setKafkaConnected } from './client';
import { startConsumers, setKafkaEventEmitter } from './consumers';
import { getIO } from '../socket';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const ensureTopics = async () => {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({
    topics: Object.values(TOPICS).map(topic => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    })),
  });
  await admin.disconnect();
};

const startConsumersWithRetry = async (retries = 10, delayMs = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await startConsumers();
      console.log('Kafka consumers started and listening');
      return;
    } catch (err: any) {
      const msg = err?.message || err;
      console.log(`Kafka consumer attempt ${i + 1}/${retries} failed (${msg}), retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
  }
  console.warn('Kafka consumers failed after all retries — running without consumers');
};

export const initKafka = async () => {
  try {
    await producer.connect();
    setKafkaConnected(true);
    console.log('Kafka producer connected');
    await ensureTopics();
    console.log('Kafka topics ensured');

    // Wire Socket.io → Kafka event emitter
    setKafkaEventEmitter((ev) => {
      const io = getIO();
      if (io) io.emit('kafka:event', ev);
    });

    await sleep(5000); // Allow KRaft coordinator to fully initialize
    await startConsumersWithRetry();
  } catch (err) {
    setKafkaConnected(false);
    console.warn('Kafka unavailable — running without event streaming');
  }
};

export { publishPatientRequest, publishMedicationEvent, publishStockUpdate } from './producers';