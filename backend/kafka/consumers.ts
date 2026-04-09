import { PharmacyModel, UserModel } from "../models";
import { sendRequestStatusEmail, sendStockAlertEmail } from "../services/emailService";
import { consumer, TOPICS } from "./client";
import { pushEvent, KafkaEvent } from "./eventStore";

// Socket.io emitter — set at boot by initKafka
let emitKafkaEvent: ((ev: KafkaEvent) => void) | null = null;
export const setKafkaEventEmitter = (fn: (ev: KafkaEvent) => void) => { emitKafkaEvent = fn; };

function record(topic: string, action: string, data: any, result: KafkaEvent['result'], detail?: string) {
  const ev = pushEvent(topic, action, data, result, detail);
  emitKafkaEvent?.(ev);
}

async function handlePatientRequest(data: any) {
  if (data.action === 'created') {
    const pharmacy = await PharmacyModel.findById(data.pharmacyId);
    if (!pharmacy) {
      record(TOPICS.PATIENT_REQUESTS, data.action, data, 'skipped', 'Pharmacy not found');
      return;
    }
    record(TOPICS.PATIENT_REQUESTS, data.action, data, 'processed', `New request at ${pharmacy.name}`);
  }

  if (data.action === 'status_changed') {
    const patient = await UserModel.findById(data.patientId);
    if (!patient?.email) {
      record(TOPICS.PATIENT_REQUESTS, data.action, data, 'skipped', 'Patient email missing');
      return;
    }
    const pharmacy = await PharmacyModel.findById(data.pharmacyId);
    await sendRequestStatusEmail(
      patient.email,
      patient.name,
      data.medicationName,
      pharmacy?.name || 'Pharmacie',
      data.status
    );
    record(TOPICS.PATIENT_REQUESTS, data.action, data, 'processed', `Email sent to ${patient.email} — ${data.status}`);
  }
}

async function handleStockUpdate(data: any) {
  if (data.entityType === 'medication' && data.stockCount != null && data.threshold != null) {
    if (data.stockCount <= data.threshold && data.stockCount > 0) {
      const user = await UserModel.findById(data.userId);
      if (user?.email) {
        await sendStockAlertEmail(user.email, user.name, data.name, data.stockCount);
        record(TOPICS.STOCK_UPDATES, 'low_stock_alert', data, 'processed', `Alert email → ${user.email} (${data.name}: ${data.stockCount})`);
        return;
      }
    }
    record(TOPICS.STOCK_UPDATES, 'stock_change', data, 'processed', `${data.name}: stock=${data.stockCount}`);
  } else {
    record(TOPICS.STOCK_UPDATES, 'stock_change', data, 'skipped', 'Incomplete stock data');
  }
}

async function handleMedicationEvent(data: any) {
  if (data.action === 'created') {
    record(TOPICS.MEDICATION_EVENTS, data.action, data, 'processed', `${data.medicationName} — schedules: ${data.schedules?.join(', ') || 'none'}`);
  } else if (data.action === 'dose_taken') {
    record(TOPICS.MEDICATION_EVENTS, data.action, data, 'processed', `Dose taken: ${data.medicationName}`);
  } else {
    record(TOPICS.MEDICATION_EVENTS, data.action || 'unknown', data, 'processed', data.medicationName);
  }
}

export const startConsumers = async () => {
  await consumer.subscribe({
    topics: Object.values(TOPICS),
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;
      let data: any;
      try { data = JSON.parse(raw); } catch { data = { raw }; }

      console.log(`[Kafka] ${topic}:`, data.action ?? '(no action)');

      try {
        switch (topic) {
          case TOPICS.PATIENT_REQUESTS:
            await handlePatientRequest(data);
            break;
          case TOPICS.STOCK_UPDATES:
            await handleStockUpdate(data);
            break;
          case TOPICS.MEDICATION_EVENTS:
            await handleMedicationEvent(data);
            break;
        }
      } catch (err: any) {
        record(topic, data.action || 'unknown', data, 'error', err?.message || 'Consumer error');
      }
    },
  });
};
