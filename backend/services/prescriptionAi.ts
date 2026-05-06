export interface OcrMedication {
  name: string;
  dosage: string;
  frequency: string;
  durationInDays: number;
  instructions: string;
  suggestedSchedules: string[];
  confidence: number;
}

export interface PrescriptionScanResult {
  medications: OcrMedication[];
  doctorName?: string;
  doctorSpecialty?: string;
  prescriptionDate?: string;
  overallConfidence: number;
  warnings: string[];
  rawTextExtracted?: string;
  processingTimeMs: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'baidu/qianfan-ocr-fast:free';

const EXTRACTION_PROMPT = `You are a specialized medical OCR system trained on Tunisian and French-language prescriptions.

TASK: Analyze this prescription image with extreme precision and extract all medications listed.

Return strictly valid JSON (no markdown fences) with this exact structure:
{
  "medications": [
    {
      "name": "string",
      "dosage": "string",
      "frequency": "string",
      "durationInDays": number,
      "instructions": "string",
      "suggestedSchedules": ["HH:MM"],
      "confidence": number (0-1)
    }
  ],
  "doctorName": "string or null",
  "doctorSpecialty": "string or null",
  "prescriptionDate": "string or null",
  "overallConfidence": number (0-1),
  "warnings": ["string"],
  "rawTextExtracted": "string"
}

Rules:
- Never invent medications
- If text is partially illegible, use lower confidence
- suggestedSchedules must be HH:MM format (e.g. "08:00", "20:00")
- Do not return markdown fences
- Do not return an empty medications array unless there is truly no prescription content visible`;

const getOpenRouterKey = () => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured on the server');
  return key;
};

const createHeaders = () => ({
  Authorization: `Bearer ${getOpenRouterKey()}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:5000',
  'X-Title': process.env.OPENROUTER_APP_NAME || 'MedCareAlert+',
});

const detectMimeType = (base64: string): string => {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
};

const parseJsonSafely = (rawText: string) => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  // Strip markdown fences if present
  const stripped = trimmed.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
};

const normalizeMedicationName = (name: string) => {
  if (!name) return name;
  return name.trim().replace(/\b\w/g, (c) => c.toUpperCase());
};

const normalizeDosage = (dosage: string) => {
  if (!dosage) return dosage;
  return dosage.replace(/\s*mg\b/gi, 'mg').replace(/\s*ml\b/gi, 'ml').replace(/\s*g\b/gi, 'g').trim();
};

const normalizeFrequency = (frequency: string) => {
  if (!frequency) return frequency;
  const lower = frequency.toLowerCase().trim();
  const map: Record<string, string> = {
    'once a day': '1 fois par jour',
    'twice a day': '2 fois par jour',
    'three times a day': '3 fois par jour',
    'morning and evening': 'Matin et soir',
    'every 8 hours': 'Toutes les 8h',
  };
  return map[lower] || frequency;
};

const validateSchedules = (schedules: string[]) => {
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  const valid = schedules.map((t) => t.trim()).filter((t) => timeRegex.test(t));
  return valid.length > 0 ? valid : ['08:00'];
};

const normalizeResult = (parsed: any, processingTimeMs: number): PrescriptionScanResult => ({
  medications: (parsed?.medications || []).map((med: any) => ({
    name: normalizeMedicationName(med.name),
    dosage: normalizeDosage(med.dosage),
    frequency: normalizeFrequency(med.frequency),
    durationInDays: Math.max(1, Math.min(365, med.durationInDays || 7)),
    instructions: med.instructions || '',
    suggestedSchedules: validateSchedules(med.suggestedSchedules || ['08:00']),
    confidence: Math.max(0, Math.min(1, med.confidence || 0.5)),
  })),
  doctorName: parsed?.doctorName || undefined,
  doctorSpecialty: parsed?.doctorSpecialty || undefined,
  prescriptionDate: parsed?.prescriptionDate || undefined,
  overallConfidence: Math.max(0, Math.min(1, parsed?.overallConfidence || 0)),
  warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
  rawTextExtracted: parsed?.rawTextExtracted || undefined,
  processingTimeMs,
});

export const scanPrescriptionOnServer = async (base64Image: string): Promise<PrescriptionScanResult> => {
  const startTime = Date.now();
  const mimeType = detectMimeType(base64Image);

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: createHeaders(),
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = `OpenRouter vision error ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message || parsed?.message || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const data = await response.json();
  const rawText: string = data?.choices?.[0]?.message?.content ?? '';
  const parsed = parseJsonSafely(rawText);

  if (parsed) {
    return normalizeResult(parsed, Date.now() - startTime);
  }

  return {
    medications: [],
    overallConfidence: 0,
    warnings: ["L'IA a répondu dans un format inattendu."],
    rawTextExtracted: rawText || undefined,
    processingTimeMs: Date.now() - startTime,
  };
};
