import { API_BASE } from './lib/appConfig';
import { readApiResponse } from './lib/api';
import { ScanResult } from './types';

export interface ExtendedScanResult extends ScanResult {
  doctorName?: string;
  doctorSpecialty?: string;
  prescriptionDate?: string;
  overallConfidence: number;
  warnings: string[];
  rawTextExtracted?: string;
  processingTimeMs: number;
}

export const scanPrescription = async (base64Image: string, token: string): Promise<ScanResult> => {
  const result = await scanPrescriptionAdvanced(base64Image, token);
  return {
    medications: result.medications.map((m) => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      durationInDays: m.durationInDays,
      suggestedSchedules: m.suggestedSchedules,
    })),
  };
};

export const scanPrescriptionAdvanced = async (base64Image: string, token: string): Promise<ExtendedScanResult> => {
  const res = await fetch(`${API_BASE}/rag/prescription-scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64Image }),
  });

  const data = await readApiResponse<ExtendedScanResult & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data?.error || 'Echec de l analyse de l ordonnance.');
  }

  return data;
};
