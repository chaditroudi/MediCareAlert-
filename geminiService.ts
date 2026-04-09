
import { GoogleGenAI, Type } from "@google/genai";
import { ScanResult } from "./types";

const GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// ── Medical OCR Prompt Engineering ───────────────────────────────────

const EXTRACTION_PROMPT = `You are a specialized medical OCR system trained on Tunisian and French-language prescriptions (ordonnances médicales).

TASK: Analyze this prescription image with extreme precision and extract ALL medications listed.

INSTRUCTIONS:
1. Read every line of handwritten or printed text on the prescription
2. For EACH medication, extract:
   - name: The exact medication name (brand or generic). Common Tunisian/French brands include: Doliprane, Augmentin, Amoxicilline, Voltarène, Aspégic, Spasfon, Smecta, Gaviscon, Mopral, Clamoxyl, Efferalgan, Dafalgan, Advil, Nurofen, Tachipirine, Ventoline, Celestene, Solupred, Kardégic, etc.
   - dosage: The strength/amount (e.g., "1000mg", "500mg", "1g", "5ml", "20mg/ml")
   - frequency: How often to take it in French (e.g., "3 fois par jour", "2 fois par jour", "1 fois par jour", "matin et soir", "toutes les 8h")
   - durationInDays: Treatment duration as integer. Parse "1 semaine"→7, "10 jours"→10, "2 semaines"→14, "1 mois"→30. Default to 7 if unspecified.
   - instructions: Any special instructions (e.g., "pendant les repas", "avant le coucher", "à jeun", "si douleur")
   - suggestedSchedules: Array of 24h times based on frequency:
     * "1 fois par jour" → ["08:00"]
     * "2 fois par jour" or "matin et soir" → ["08:00", "20:00"]
     * "3 fois par jour" → ["08:00", "14:00", "20:00"]
     * "4 fois par jour" or "toutes les 6h" → ["06:00", "12:00", "18:00", "00:00"]
     * "au coucher" → ["22:00"]
   - confidence: Your confidence level 0.0-1.0 on this extraction's accuracy

3. Also extract doctor information if visible:
   - doctorName: Prescribing doctor's name
   - doctorSpecialty: Specialty if mentioned
   - prescriptionDate: Date on prescription (ISO format YYYY-MM-DD)

4. Provide an overall confidence score and any warnings about readability

CRITICAL RULES:
- Never invent medications that aren't on the prescription
- If text is partially illegible, extract what you can and set confidence lower
- Distinguish between medication names and dosage instructions carefully
- Handle both handwritten and printed text
- Handle Arabic/French bilingual prescriptions common in Tunisia

Return strictly valid JSON.`;

// ── Schema Definition ────────────────────────────────────────────────

const MEDICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    dosage: { type: Type.STRING },
    frequency: { type: Type.STRING },
    durationInDays: { type: Type.NUMBER },
    instructions: { type: Type.STRING },
    suggestedSchedules: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    confidence: { type: Type.NUMBER }
  },
  required: ["name", "dosage", "frequency", "durationInDays", "suggestedSchedules", "confidence"]
};

const FULL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    medications: {
      type: Type.ARRAY,
      items: MEDICATION_SCHEMA
    },
    doctorName: { type: Type.STRING },
    doctorSpecialty: { type: Type.STRING },
    prescriptionDate: { type: Type.STRING },
    overallConfidence: { type: Type.NUMBER },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    rawTextExtracted: { type: Type.STRING }
  },
  required: ["medications", "overallConfidence", "warnings"]
};

// ── Types ────────────────────────────────────────────────────────────

export interface ExtendedScanResult extends ScanResult {
  doctorName?: string;
  doctorSpecialty?: string;
  prescriptionDate?: string;
  overallConfidence: number;
  warnings: string[];
  rawTextExtracted?: string;
  processingTimeMs: number;
}

// ── Main OCR Function ────────────────────────────────────────────────

export const scanPrescription = async (base64Image: string): Promise<ScanResult> => {
  const result = await scanPrescriptionAdvanced(base64Image);
  // Return backward-compatible ScanResult
  return {
    medications: result.medications.map(m => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      durationInDays: m.durationInDays,
      suggestedSchedules: m.suggestedSchedules,
    }))
  };
};

export const scanPrescriptionAdvanced = async (base64Image: string): Promise<ExtendedScanResult> => {
  const startTime = Date.now();
  const model = 'gemini-2.5-flash';

  try {
    // Detect image MIME type from base64 header
    const mimeType = detectMimeType(base64Image);

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: EXTRACTION_PROMPT }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: FULL_RESPONSE_SCHEMA as any,
        temperature: 0.1, // Low temperature for factual extraction
      }
    });

    const parsed = JSON.parse(response.text || '{"medications":[],"overallConfidence":0,"warnings":["Parsing failed"]}');
    const processingTimeMs = Date.now() - startTime;

    // Post-process: normalize medication names and validate schedules
    const medications = (parsed.medications || []).map((med: any) => ({
      ...med,
      name: normalizeMedicationName(med.name),
      dosage: normalizeDosage(med.dosage),
      frequency: normalizeFrequency(med.frequency),
      durationInDays: Math.max(1, Math.min(365, med.durationInDays || 7)),
      instructions: med.instructions || '',
      suggestedSchedules: validateSchedules(med.suggestedSchedules || ['08:00']),
      confidence: Math.max(0, Math.min(1, med.confidence || 0.5)),
    }));

    return {
      medications,
      doctorName: parsed.doctorName || undefined,
      doctorSpecialty: parsed.doctorSpecialty || undefined,
      prescriptionDate: parsed.prescriptionDate || undefined,
      overallConfidence: Math.max(0, Math.min(1, parsed.overallConfidence || 0)),
      warnings: parsed.warnings || [],
      rawTextExtracted: parsed.rawTextExtracted || undefined,
      processingTimeMs,
    };
  } catch (error) {
    console.error('Gemini OCR failed:', error);
    return {
      medications: [],
      overallConfidence: 0,
      warnings: ['L\'analyse IA a échoué. Veuillez réessayer ou saisir manuellement.'],
      processingTimeMs: Date.now() - startTime,
    };
  }
};

// ── NLP Post-Processing Helpers ──────────────────────────────────────

/** Detect MIME type from base64 string */
function detectMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg'; // Default fallback
}

/** Normalize medication names: capitalize, fix common OCR errors */
function normalizeMedicationName(name: string): string {
  if (!name) return name;

  // Common OCR misreads for medication names
  const corrections: Record<string, string> = {
    'dolipran': 'Doliprane',
    'doliprane': 'Doliprane',
    'dolipranne': 'Doliprane',
    'augmentin': 'Augmentin',
    'augmantine': 'Augmentin',
    'amoxiciline': 'Amoxicilline',
    'amoxicilline': 'Amoxicilline',
    'amoxicilin': 'Amoxicilline',
    'voltaren': 'Voltarène',
    'voltarene': 'Voltarène',
    'spasfon': 'Spasfon',
    'spasfone': 'Spasfon',
    'smecta': 'Smecta',
    'gaviscon': 'Gaviscon',
    'mopral': 'Mopral',
    'clamoxyl': 'Clamoxyl',
    'efferalgan': 'Efferalgan',
    'dafalgan': 'Dafalgan',
    'nurofen': 'Nurofen',
    'advil': 'Advil',
    'ventoline': 'Ventoline',
    'celestene': 'Célestène',
    'celestène': 'Célestène',
    'solupred': 'Solupred',
    'kardegic': 'Kardégic',
    'kardégic': 'Kardégic',
    'aspegic': 'Aspégic',
    'aspégic': 'Aspégic',
    'paracetamol': 'Paracétamol',
    'paracétamol': 'Paracétamol',
    'ibuprofene': 'Ibuprofène',
    'ibuprofène': 'Ibuprofène',
    'metformine': 'Metformine',
    'losartan': 'Losartan',
    'amlodipine': 'Amlodipine',
    'omeprazol': 'Oméprazole',
    'omeprazole': 'Oméprazole',
    'pantoprazol': 'Pantoprazole',
    'pantoprazole': 'Pantoprazole',
  };

  const lower = name.trim().toLowerCase();
  if (corrections[lower]) return corrections[lower];

  // Capitalize first letter of each word
  return name.trim().replace(/\b\w/g, c => c.toUpperCase());
}

/** Normalize dosage format */
function normalizeDosage(dosage: string): string {
  if (!dosage) return dosage;
  return dosage
    .replace(/\s*mg\b/gi, 'mg')
    .replace(/\s*ml\b/gi, 'ml')
    .replace(/\s*g\b/gi, 'g')
    .replace(/\s*µg\b/gi, 'µg')
    .replace(/1\s*g\b/gi, '1g')
    .trim();
}

/** Normalize frequency expressions to consistent French */
function normalizeFrequency(freq: string): string {
  if (!freq) return freq;
  const lower = freq.toLowerCase().trim();

  const map: Record<string, string> = {
    'once a day': '1 fois par jour',
    'twice a day': '2 fois par jour',
    'three times a day': '3 fois par jour',
    'once daily': '1 fois par jour',
    'twice daily': '2 fois par jour',
    'thrice daily': '3 fois par jour',
    'every 8 hours': 'Toutes les 8h',
    'every 12 hours': 'Toutes les 12h',
    'every 6 hours': 'Toutes les 6h',
    'morning and evening': 'Matin et soir',
    'at bedtime': 'Au coucher',
    'as needed': 'Si besoin',
  };

  return map[lower] || freq;
}

/** Validate schedule times are in HH:MM 24h format */
function validateSchedules(schedules: string[]): string[] {
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  return schedules
    .map(t => t.trim())
    .filter(t => timeRegex.test(t))
    .length > 0
    ? schedules.filter(t => timeRegex.test(t.trim()))
    : ['08:00']; // Fallback
}

// ── Pharmacy Search (unchanged) ──────────────────────────────────────

export const findNearbyPharmacies = async (lat: number, lng: number, query: string = "pharmacies") => {
  const response = await ai.models.generateContent({
    // Using gemini-2.5-flash as maps grounding is supported in this series
    model: "gemini-2.5-flash",
    contents: `List active and nearby ${query} around my location (${lat}, ${lng}) in Tunisia. 
    For each pharmacy, provide:
    - Name
    - Address
    - Coordinates (latitude and longitude)
    - Services
    
    Format the response as a list.`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    },
  });

  return {
    text: response.text,
    grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  };
};
