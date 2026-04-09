import { Request, Response } from 'express';
import { PatientRequestModel, PharmacyModel, UserModel } from '../models';
import { toClient, toId } from '../helpers/utils';
import { publishPatientRequest } from '../kafka';
import { emitRequestEvent } from '../socket';

const serializeRequest = async (requestDoc: any) => {
  const request = toClient(requestDoc);
  const [patient, pharmacy] = await Promise.all([
    UserModel.findById(request.patientId).select('name email'),
    PharmacyModel.findById(request.pharmacyId).select('name address'),
  ]);

  return {
    ...request,
    patientName: patient?.name || '',
    patientEmail: patient?.email || '',
    pharmacyName: pharmacy?.name || '',
    pharmacyAddress: pharmacy?.address || '',
  };
};

export const create = async (req: Request, res: Response) => {
  try {
    const { pharmacyId, medicationName, note } = req.body || {};
    if (!pharmacyId || !medicationName) {
      return res.status(400).json({ error: 'pharmacyId and medicationName are required' });
    }

    const request = await PatientRequestModel.create({
      patientId: (req as any).user.id,
      pharmacyId,
      medicationName,
      note: note || ''
    });
    await publishPatientRequest({
      patientId: (req as any).user.id,
      pharmacyId,
      medicationName,
      requestId: toId(request._id),
      action: 'created'
    });

    const serialized = await serializeRequest(request);
    emitRequestEvent('request:created', serialized);
    return res.status(201).json(serialized);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to create request' });
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    let filter: any = {};

    if ((req as any).user.role === 'PATIENT') {
      filter = { patientId: (req as any).user.id };
    } else if ((req as any).user.role === 'PHARMACIST') {
      const pharmacist = await UserModel.findById((req as any).user.id);
      if (!pharmacist?.pharmacyId) {
        return res.json([]);
      }
      filter = { pharmacyId: pharmacist.pharmacyId };
    }

    const requests = await PatientRequestModel.find(filter).sort({ createdAt: -1 });
    return res.json(await Promise.all(requests.map(serializeRequest)));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });

    const request = await PatientRequestModel.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if ((req as any).user.role === 'PHARMACIST') {
      const pharmacist = await UserModel.findById((req as any).user.id);
      if (!pharmacist?.pharmacyId || toId(pharmacist.pharmacyId) !== toId(request.pharmacyId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    request.status = status;
    await request.save();

    // kafka :
    await publishPatientRequest({
      patientId:toId(request.patientId),
      pharmacyId:toId(request.pharmacyId),
      medicationName:request.medicationName,
      requestId:toId(request._id),
      action:'status_changed',
      status
    });
    
    const serialized = await serializeRequest(request);
    emitRequestEvent('request:updated', serialized);
    return res.json(serialized);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to update request' });
  }
};
