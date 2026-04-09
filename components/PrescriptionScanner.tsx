
import React, { useState, useRef, useCallback } from 'react';
import { scanPrescriptionAdvanced, ExtendedScanResult } from '../geminiService';
import { preprocessImage, quickQualityCheck, PreprocessingResult } from '../imagePreprocessing';

type Step = 'upload' | 'preprocess' | 'scanning' | 'results';

interface ExtractedMed {
  name: string;
  dosage: string;
  frequency: string;
  durationInDays: number;
  instructions: string;
  suggestedSchedules: string[];
  confidence: number;
}

interface PrescriptionScannerProps {
  token: string;
  onClose: () => void;
  onComplete: (meds: any[]) => void;
}

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'upload', label: 'Photo', icon: 'fa-camera' },
  { key: 'preprocess', label: 'Qualité', icon: 'fa-sliders' },
  { key: 'scanning', label: 'Analyse', icon: 'fa-brain' },
  { key: 'results', label: 'Résultats', icon: 'fa-check-circle' },
];

const PrescriptionScanner: React.FC<PrescriptionScannerProps> = ({ token, onClose, onComplete }) => {
  const [step, setStep] = useState<Step>('upload');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [preprocessResult, setPreprocessResult] = useState<PreprocessingResult | null>(null);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);
  const [qualityScore, setQualityScore] = useState<number>(0);
  const [scanResult, setScanResult] = useState<ExtendedScanResult | null>(null);
  const [editedMeds, setEditedMeds] = useState<ExtractedMed[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanningPhase, setScanningPhase] = useState('');
  const [showPreprocessed, setShowPreprocessed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const currentStepIndex = STEPS.findIndex(s => s.key === step);

  // ── Step 1: Upload ──────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Le fichier dépasse 10 Mo. Choisissez une image plus petite.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setImageDataUrl(dataUrl);

      // Quick quality check
      try {
        const check = await quickQualityCheck(dataUrl);
        setQualityScore(check.score);
        setQualityWarnings(check.warnings);
      } catch {
        setQualityScore(50);
        setQualityWarnings([]);
      }

      setStep('preprocess');
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Step 2: Preprocess & confirm ────────────────────────────────────
  const handlePreprocess = useCallback(async () => {
    if (!imageDataUrl) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await preprocessImage(imageDataUrl);
      setPreprocessResult(result);
      setQualityScore(result.metadata.qualityScore);
    } catch (err) {
      console.error('Preprocessing failed:', err);
      setError('Le prétraitement a échoué. L\'image originale sera utilisée.');
    } finally {
      setIsProcessing(false);
    }
  }, [imageDataUrl]);

  // ── Step 3: Scan ────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    setStep('scanning');
    setIsProcessing(true);
    setError(null);

    const base64 = preprocessResult?.processedBase64
      || (imageDataUrl?.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl) || '';

    try {
      setScanningPhase('Envoi à Gemini AI...');
      await new Promise(r => setTimeout(r, 300)); // brief UI update pause

      setScanningPhase('Extraction des médicaments...');
      const result = await scanPrescriptionAdvanced(base64);

      setScanningPhase('Post-traitement NLP...');
      await new Promise(r => setTimeout(r, 200));

      if (result.medications.length === 0 && result.overallConfidence < 0.2) {
        setError("L'IA n'a trouvé aucun médicament. Essayez une photo plus nette ou ajoutez manuellement.");
        setStep('preprocess');
        setIsProcessing(false);
        return;
      }

      setScanResult(result);
      setEditedMeds((result as any).medications.map((m: any) => ({
        name: m.name || '',
        dosage: m.dosage || '',
        frequency: m.frequency || '',
        durationInDays: m.durationInDays || 7,
        instructions: m.instructions || '',
        suggestedSchedules: m.suggestedSchedules || ['08:00'],
        confidence: m.confidence || 0.5,
      })));
      setStep('results');
    } catch (err) {
      console.error('Scan failed:', err);
      setError("L'analyse a échoué. Vérifiez votre connexion et réessayez.");
      setStep('preprocess');
    } finally {
      setIsProcessing(false);
    }
  }, [preprocessResult, imageDataUrl]);

  // ── Step 4: Edit & Confirm ──────────────────────────────────────────
  const updateMed = (idx: number, field: keyof ExtractedMed, value: any) => {
    setEditedMeds(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const removeMed = (idx: number) => {
    setEditedMeds(prev => prev.filter((_, i) => i !== idx));
  };

  const addMed = () => {
    setEditedMeds(prev => [...prev, {
      name: '', dosage: '', frequency: '1 fois par jour',
      durationInDays: 7, instructions: '',
      suggestedSchedules: ['08:00'], confidence: 1.0,
    }]);
  };

  const handleConfirm = async () => {
    const validMeds = editedMeds.filter(m => m.name.trim());
    if (validMeds.length === 0) {
      setError('Ajoutez au moins un médicament.');
      return;
    }

    // Save prescription with image to backend via FormData
    try {
      const formData = new FormData();
      formData.append('extractedData', JSON.stringify({
        medications: validMeds,
        doctorName: scanResult?.doctorName,
        prescriptionDate: scanResult?.prescriptionDate,
      }));
      formData.append('overallConfidence', String(scanResult?.overallConfidence || 0));
      formData.append('processingTimeMs', String(scanResult?.processingTimeMs || 0));
      formData.append('status', 'processed');

      // Attach original image if available
      if (imageDataUrl) {
        const blob = await (await fetch(imageDataUrl)).blob();
        formData.append('image', blob, 'prescription.jpg');
      }

      await fetch('http://localhost:5000/api/prescriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
    } catch (saveErr) {
      console.error("Failed to save prescription to history", saveErr);
    }

    onComplete(validMeds.map(m => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      durationInDays: m.durationInDays,
      suggestedSchedules: m.suggestedSchedules,
    })));
  };

  const reset = () => {
    setStep('upload');
    setImageDataUrl(null);
    setPreprocessResult(null);
    setScanResult(null);
    setEditedMeds([]);
    setQualityWarnings([]);
    setQualityScore(0);
    setError(null);
    setShowPreprocessed(false);
  };

  // ── Confidence badge ────────────────────────────────────────────────
  const ConfidenceBadge = ({ value }: { value: number }) => {
    const pct = Math.round(value * 100);
    const color = pct >= 80 ? 'text-emerald-600 bg-emerald-50' : pct >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>;
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl flex items-center justify-center">
              <i className="fas fa-prescription-bottle-medical text-lg"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Scan IA d'Ordonnance</h2>
              <p className="text-xs text-slate-400">Extraction intelligente propulsée par Gemini</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center px-6 py-3 bg-slate-50 gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                i < currentStepIndex ? 'bg-emerald-100 text-emerald-700' :
                i === currentStepIndex ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-400'
              }`}>
                <i className={`fas ${i < currentStepIndex ? 'fa-check' : s.icon} text-[10px]`}></i>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 rounded ${i < currentStepIndex ? 'bg-emerald-300' : 'bg-slate-200'}`}></div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Upload Step ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
              >
                <i className="fas fa-cloud-arrow-up text-4xl text-slate-300 group-hover:text-blue-500 mb-3 transition block"></i>
                <p className="font-medium text-slate-700">Choisir une photo d'ordonnance</p>
                <p className="text-sm text-slate-400 mt-1">JPEG, PNG — jusqu'à 10 Mo</p>
                <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" accept="image/jpeg,image/png,image/webp" />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">ou</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all"
              >
                <i className="fas fa-camera"></i>
                Prendre une photo
                <input ref={cameraInputRef} type="file" onChange={handleFileChange} className="hidden" accept="image/*" capture="environment" />
              </button>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl flex gap-2 items-center text-sm">
                  <i className="fas fa-circle-exclamation"></i>
                  <p>{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Preprocess Step ── */}
          {step === 'preprocess' && imageDataUrl && (
            <div className="space-y-4">
              {/* Image preview with toggle */}
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={showPreprocessed && preprocessResult
                    ? `data:image/jpeg;base64,${preprocessResult.processedBase64}`
                    : imageDataUrl}
                  alt="Ordonnance"
                  className="w-full max-h-64 object-contain"
                />
                {preprocessResult && (
                  <button
                    onClick={() => setShowPreprocessed(!showPreprocessed)}
                    className="absolute bottom-2 right-2 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-slate-600 hover:bg-white transition shadow-sm"
                  >
                    <i className={`fas ${showPreprocessed ? 'fa-image' : 'fa-wand-magic-sparkles'} mr-1`}></i>
                    {showPreprocessed ? 'Original' : 'Traitée'}
                  </button>
                )}
              </div>

              {/* Quality Score */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-slate-700">Qualité d'image</span>
                    <span className={`text-sm font-bold ${qualityScore >= 60 ? 'text-emerald-600' : qualityScore >= 35 ? 'text-amber-600' : 'text-red-600'}`}>
                      {qualityScore}/100
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${qualityScore >= 60 ? 'bg-emerald-500' : qualityScore >= 35 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${qualityScore}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Quality warnings */}
              {qualityWarnings.length > 0 && (
                <div className="space-y-2">
                  {qualityWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 text-amber-800 rounded-lg text-sm">
                      <i className="fas fa-triangle-exclamation mt-0.5 text-amber-500"></i>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Preprocessing steps done */}
              {preprocessResult && (
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs font-semibold text-blue-700 mb-2">
                    <i className="fas fa-wand-magic-sparkles mr-1"></i> Optimisations appliquées
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {preprocessResult.metadata.appliedSteps.map((s, i) => (
                      <span key={i} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl flex gap-2 items-center text-sm">
                  <i className="fas fa-circle-exclamation"></i>
                  <p>{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-2.5 text-slate-600 font-medium border border-slate-200 hover:bg-slate-50 rounded-xl transition text-sm"
                >
                  <i className="fas fa-arrow-left mr-1"></i> Changer
                </button>
                {!preprocessResult ? (
                  <button
                    onClick={handlePreprocess}
                    disabled={isProcessing}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition text-sm disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <><i className="fas fa-spinner fa-spin mr-1"></i> Optimisation...</>
                    ) : (
                      <><i className="fas fa-wand-magic-sparkles mr-1"></i> Optimiser</>
                    )}
                  </button>
                ) : null}
                <button
                  onClick={handleScan}
                  disabled={isProcessing}
                  className="flex-[2] py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition text-sm disabled:opacity-50"
                >
                  <i className="fas fa-brain mr-1"></i> Analyser avec l'IA
                </button>
              </div>
            </div>
          )}

          {/* ── Scanning Step ── */}
          {step === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-blue-200 rounded-full animate-ping opacity-20"></div>
                <div className="absolute inset-0 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                  <i className="fas fa-brain text-white text-xl"></i>
                </div>
              </div>
              <p className="text-lg font-semibold text-slate-700 mb-1">Analyse en cours</p>
              <p className="text-sm text-blue-600 font-medium">{scanningPhase}</p>
              <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
                <i className="fas fa-shield-halved"></i>
                <span>Vos données sont traitées de manière sécurisée</span>
              </div>
            </div>
          )}

          {/* ── Results Step ── */}
          {step === 'results' && scanResult && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center gap-4 p-3 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">{editedMeds.length}</p>
                  <p className="text-[11px] text-slate-500">médicament{editedMeds.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="w-px h-10 bg-slate-200"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">{Math.round(scanResult.overallConfidence * 100)}%</p>
                  <p className="text-[11px] text-slate-500">confiance</p>
                </div>
                <div className="w-px h-10 bg-slate-200"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">{(scanResult.processingTimeMs / 1000).toFixed(1)}s</p>
                  <p className="text-[11px] text-slate-500">temps</p>
                </div>
                {scanResult.doctorName && (
                  <>
                    <div className="w-px h-10 bg-slate-200"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">Dr. {scanResult.doctorName}</p>
                      <p className="text-[11px] text-slate-500">{scanResult.prescriptionDate || 'Date non détectée'}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Warnings from AI */}
              {scanResult.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {scanResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 text-amber-800 rounded-lg text-xs">
                      <i className="fas fa-info-circle mt-0.5 text-amber-500"></i>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Medication cards — editable */}
              <div className="space-y-3">
                {editedMeds.map((med, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-3 relative group">
                    <button
                      onClick={() => removeMed(idx)}
                      className="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1 rounded transition opacity-0 group-hover:opacity-100"
                      title="Supprimer"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>

                    {/* Row 1: Name + Confidence */}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-pills text-sm"></i>
                      </div>
                      <input
                        type="text"
                        value={med.name}
                        onChange={e => updateMed(idx, 'name', e.target.value)}
                        className="flex-1 font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none px-1 py-0.5 transition"
                        placeholder="Nom du médicament"
                      />
                      <ConfidenceBadge value={med.confidence} />
                    </div>

                    {/* Row 2: Dosage, Frequency, Duration */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Dosage</label>
                        <input
                          type="text"
                          value={med.dosage}
                          onChange={e => updateMed(idx, 'dosage', e.target.value)}
                          className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200 focus:border-blue-400 focus:outline-none transition"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Fréquence</label>
                        <input
                          type="text"
                          value={med.frequency}
                          onChange={e => updateMed(idx, 'frequency', e.target.value)}
                          className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200 focus:border-blue-400 focus:outline-none transition"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Durée (jours)</label>
                        <input
                          type="number"
                          value={med.durationInDays}
                          onChange={e => updateMed(idx, 'durationInDays', parseInt(e.target.value) || 1)}
                          min={1}
                          max={365}
                          className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200 focus:border-blue-400 focus:outline-none transition"
                        />
                      </div>
                    </div>

                    {/* Row 3: Instructions */}
                    {med.instructions && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Instructions</label>
                        <input
                          type="text"
                          value={med.instructions}
                          onChange={e => updateMed(idx, 'instructions', e.target.value)}
                          className="w-full text-sm text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200 focus:border-blue-400 focus:outline-none transition italic"
                        />
                      </div>
                    )}

                    {/* Row 4: Schedules */}
                    <div className="flex flex-wrap gap-1.5">
                      {med.suggestedSchedules.map((t, ti) => (
                        <span key={ti} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                          <i className="fas fa-clock text-[9px]"></i> {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add medication button */}
              <button
                onClick={addMed}
                className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:text-blue-600 hover:border-blue-300 transition"
              >
                <i className="fas fa-plus mr-1"></i> Ajouter un médicament
              </button>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl flex gap-2 items-center text-sm">
                  <i className="fas fa-circle-exclamation"></i>
                  <p>{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step === 'results' && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
            <button
              onClick={reset}
              className="px-4 py-2.5 text-slate-600 font-medium border border-slate-200 hover:bg-slate-50 rounded-xl transition text-sm"
            >
              <i className="fas fa-redo mr-1"></i> Recommencer
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition text-sm"
            >
              <i className="fas fa-check mr-1"></i> Confirmer et ajouter {editedMeds.filter(m => m.name.trim()).length} médicament{editedMeds.filter(m => m.name.trim()).length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrescriptionScanner;
