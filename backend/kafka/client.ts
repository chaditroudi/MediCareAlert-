import { Kafka, logLevel } from 'kafkajs';

export const kafka = new Kafka({
  clientId: 'medcarealert',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: 'medcare-group' });

export let kafkaConnected = false;
export const setKafkaConnected = (v: boolean) => { kafkaConnected = v; };

export const TOPICS = {
  PATIENT_REQUESTS: 'patient-requests',
  MEDICATION_EVENTS: 'medication-events',
  STOCK_UPDATES: 'stock-updates',
} as const;