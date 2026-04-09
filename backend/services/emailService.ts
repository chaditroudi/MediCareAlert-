import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const FROM = process.env.SMTP_FROM || 'MedCareAlert+ <noreply@medcarealert.com>';
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const isConfigured = (): boolean => {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
};

/** Resolve a relative image URL (e.g. /uploads/medications/123.jpg) to an absolute file path */
const resolveImagePath = (imageUrl?: string): string | undefined => {
  if (!imageUrl) return undefined;
  // imageUrl looks like "/uploads/medications/123.jpg"
  const relative = imageUrl.replace(/^\/uploads\//, '');
  return path.join(UPLOADS_DIR, relative);
};

export interface EmailAttachment {
  filename: string;
  path: string;
  cid?: string; // Content-ID for inline embedding
}

export const sendReminderEmail = async (
  to: string, patientName: string, medName: string, dosage: string, time: string,
  imageUrl?: string
) => {
  if (!isConfigured()) return;
  const imagePath = resolveImagePath(imageUrl);
  const attachments: EmailAttachment[] = [];
  let imageHtml = '';

  if (imagePath) {
    attachments.push({
      filename: path.basename(imagePath),
      path: imagePath,
      cid: 'medimage',
    });
    imageHtml = `<div style="text-align:center;margin:12px 0;"><img src="cid:medimage" alt="${medName}" style="max-width:200px;border-radius:12px;" /></div>`;
  }

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `💊 Rappel : ${medName} - ${time}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="color:#1e293b;">Rappel de Médicament</h2>
          <p>Bonjour <strong>${patientName}</strong>,</p>
          <p>C'est l'heure de prendre votre médicament :</p>
          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin:16px 0;">
            <p style="margin:0;font-size:18px;font-weight:bold;color:#2563eb;">${medName}</p>
            <p style="margin:4px 0 0;color:#64748b;">${dosage} — ${time}</p>
          </div>
          ${imageHtml}
          <p style="color:#94a3b8;font-size:12px;">— MedCareAlert+</p>
        </div>
      `,
      attachments,
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }
};

export const sendStockAlertEmail = async (to: string, patientName: string, medName: string, remaining: number) => {
  if (!isConfigured()) return;
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `⚠️ Stock bas : ${medName} (${remaining} restants)`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #fecaca;border-radius:16px;">
          <h2 style="color:#dc2626;">Alerte de Stock</h2>
          <p>Bonjour <strong>${patientName}</strong>,</p>
          <p>Le stock de votre médicament est bas :</p>
          <div style="background:#fef2f2;padding:16px;border-radius:12px;margin:16px 0;">
            <p style="margin:0;font-size:18px;font-weight:bold;color:#dc2626;">${medName}</p>
            <p style="margin:4px 0 0;color:#64748b;">${remaining} unités restantes</p>
          </div>
          <p>Veuillez vous réapprovisionner dès que possible.</p>
          <p style="color:#94a3b8;font-size:12px;">— MedCareAlert+</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Stock alert email failed:', err);
  }
};

export const sendRequestStatusEmail = async (to: string, patientName: string, medName: string, pharmacyName: string, status: string) => {
  if (!isConfigured()) return;
  const statusLabels: Record<string, string> = {
    confirmed: 'Confirmé — Disponible',
    out_of_stock: 'Rupture de stock',
    resolved: 'Résolu'
  };
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `📋 Demande ${statusLabels[status] || status} : ${medName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="color:#1e293b;">Mise à jour de votre demande</h2>
          <p>Bonjour <strong>${patientName}</strong>,</p>
          <p>Votre demande pour <strong>${medName}</strong> auprès de <strong>${pharmacyName}</strong> a été mise à jour :</p>
          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin:16px 0;">
            <p style="margin:0;font-size:18px;font-weight:bold;">${statusLabels[status] || status}</p>
          </div>
          <p style="color:#94a3b8;font-size:12px;">— MedCareAlert+</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Request status email failed:', err);
  }
};

export const sendPrescriptionEmail = async (
  to: string,
  patientName: string,
  medNames: string[],
  prescriptionImageUrl?: string
) => {
  if (!isConfigured()) return;
  const imagePath = resolveImagePath(prescriptionImageUrl);
  const attachments: EmailAttachment[] = [];
  let imageHtml = '';

  if (imagePath) {
    attachments.push({
      filename: 'ordonnance.jpg',
      path: imagePath,
      cid: 'prescription',
    });
    imageHtml = `<div style="text-align:center;margin:16px 0;"><img src="cid:prescription" alt="Ordonnance" style="max-width:400px;border-radius:12px;border:1px solid #e2e8f0;" /></div>`;
  }

  const medList = medNames.map(n => `<li style="padding:4px 0;">${n}</li>`).join('');

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `📋 Ordonnance numérisée — ${medNames.length} médicament${medNames.length > 1 ? 's' : ''} extrait${medNames.length > 1 ? 's' : ''}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="color:#1e293b;">Ordonnance Numérisée</h2>
          <p>Bonjour <strong>${patientName}</strong>,</p>
          <p>Votre ordonnance a été analysée avec succès. Médicaments extraits :</p>
          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin:16px 0;">
            <ul style="margin:0;padding-left:20px;color:#1e293b;font-weight:bold;">${medList}</ul>
          </div>
          ${imageHtml}
          <p style="color:#64748b;font-size:13px;">Vérifiez les détails dans votre application MedCareAlert+.</p>
          <p style="color:#94a3b8;font-size:12px;">— MedCareAlert+</p>
        </div>
      `,
      attachments,
    });
  } catch (err) {
    console.error('Prescription email failed:', err);
  }
};
