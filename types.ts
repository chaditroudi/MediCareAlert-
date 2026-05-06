
export enum UserRole {
  PATIENT = 'PATIENT',
  PHARMACIST = 'PHARMACIST',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  profileImageUrl?: string;
  location?: {
    lat: number;
    lng: number;
  };
  pharmacyId?: string;
}

export interface MedicationHistory {
  date: string;
  time: string;
  status: 'taken' | 'missed';
}

export interface Medication {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  frequency: string;
  durationInDays: number;
  startDate: string;
  stockCount: number;
  threshold: number;
  schedules: string[]; // e.g., ["08:00", "20:00"]
  history: MedicationHistory[];
  isActive: boolean;
  takenTodayCount?: number;
}

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  phone: string;
  ownerId?: string;
  services: string[]; // e.g., ["24/7", "Vaccinations", "Delivery"]
  isActive: boolean;
}

export interface PharmacyInventory {
  id: string;
  pharmacyId: string;
  medicationName: string;
  quantity?: number;
  threshold?: number;
  category?: string;
  expiryDate?: string;
  stockStatus: 'available' | 'low' | 'out_of_stock' | 'expired';
  lastUpdated: string;
}

export interface Prescription {
  id: string;
  userId: string;
  imageUrl?: string;
  extractedData: {
    medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
      durationInDays: number;
      instructions?: string;
      confidence?: number;
    }>;
    doctorName?: string;
    prescriptionDate?: string;
  };
  overallConfidence?: number;
  processingTimeMs?: number;
  status: 'pending' | 'processed' | 'failed';
  createdAt: string;
}

export interface ScanResult {
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    durationInDays: number;
    suggestedSchedules: string[];
  }>;
}
