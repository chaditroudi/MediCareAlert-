import { producer, TOPICS, kafkaConnected } from "./client";

export const publishPatientRequest = async (data: {
  patientId: string;
  pharmacyId: string;
  medicationName: string;
  requestId: string;
  action: "created" | "status_changed";
  status?: string;
}) => {
  if (!kafkaConnected) return;
  await producer.send({
    topic: TOPICS.PATIENT_REQUESTS,
    messages: [
      {
        key: data.pharmacyId,
        value: JSON.stringify(data),
      },
    ],
  });
};

export const publishMedicationEvent = async (data: {
  userId: string;
  medicationId: string;
  medicationName: string;
  action: "created" | "dose_taken" | "updated" | "deleted";
  schedules?: string[];
}) => {
  if (!kafkaConnected) return;
  await producer.send({
    topic: TOPICS.MEDICATION_EVENTS,
    messages: [
      {
        key: data.userId,
        value: JSON.stringify(data),
      },
    ],
  });
};
export const publishStockUpdate = async (data: {
  entityType: "medication" | "pharmacy_inventory";
  entityId: string;
  name: string;
  stockCount?: number;
  threshold?: number;
  stockStatus?: string;
  userId?: string;
  pharmacyId?: string  | string[];
}) => {
  if (!kafkaConnected) return;
  await producer.send({
    topic: TOPICS.STOCK_UPDATES,
    messages: [{ key: data.entityId, value: JSON.stringify(data) }],
  });
};
