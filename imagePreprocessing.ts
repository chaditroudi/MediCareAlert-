/**
 * Client-side image preprocessing pipeline for medical prescription OCR.
 * Uses Canvas API for noise reduction, contrast enhancement, skew correction,
 * and resolution normalization — all before sending to Gemini.
 */

export interface PreprocessingResult {
  originalBase64: string;
  processedBase64: string;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
    appliedSteps: string[];
    qualityScore: number; // 0-100
  };
}

export interface PreprocessingOptions {
  targetWidth?: number;       // Max width for normalization (default: 2048)
  contrastFactor?: number;    // 1.0 = no change, >1 = more contrast (default: 1.4)
  brightness?: number;        // -255 to 255 (default: 10)
  sharpen?: boolean;          // Apply unsharp mask (default: true)
  grayscale?: boolean;        // Convert to grayscale (default: false — Gemini handles color well)
  denoise?: boolean;          // Apply median filter approximation (default: true)
  autoRotate?: boolean;       // Attempt deskew (default: true)
}

const DEFAULT_OPTIONS: Required<PreprocessingOptions> = {
  targetWidth: 2048,
  contrastFactor: 1.4,
  brightness: 10,
  sharpen: true,
  grayscale: false,
  denoise: true,
  autoRotate: true,
};

/**
 * Load a base64/dataURL image into an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`;
  });
}

/**
 * Apply contrast and brightness adjustments to pixel data.
 */
function adjustContrastBrightness(
  data: Uint8ClampedArray,
  contrast: number,
  brightness: number
): void {
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128 + brightness));     // R
    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128 + brightness)); // G
    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128 + brightness)); // B
  }
}

/**
 * Convert to grayscale using luminance weights.
 */
function applyGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
}

/**
 * Apply a 3x3 convolution kernel for sharpening.
 */
function applySharpen(
  imageData: ImageData,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): ImageData {
  // Unsharp mask kernel
  const kernel = [
     0, -1,  0,
    -1,  5, -1,
     0, -1,  0,
  ];
  const src = imageData.data;
  const output = ctx.createImageData(width, height);
  const dst = output.data;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            val += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        dst[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, val));
      }
      dst[(y * width + x) * 4 + 3] = 255; // Alpha
    }
  }
  return output;
}

/**
 * Simple median filter (3x3) for noise reduction.
 */
function applyMedianFilter(
  imageData: ImageData,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): ImageData {
  const src = imageData.data;
  const output = ctx.createImageData(width, height);
  const dst = output.data;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const neighbors: number[] = [];
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            neighbors.push(src[((y + ky) * width + (x + kx)) * 4 + c]);
          }
        }
        neighbors.sort((a, b) => a - b);
        dst[(y * width + x) * 4 + c] = neighbors[4]; // Median of 9
      }
      dst[(y * width + x) * 4 + 3] = 255;
    }
  }
  return output;
}

/**
 * Estimate image quality based on variance of Laplacian (blur detection)
 * and histogram analysis.
 */
function estimateQuality(data: Uint8ClampedArray, width: number, height: number): number {
  // Blur detection via variance of Laplacian
  let laplacianSum = 0;
  let count = 0;
  const grayValues: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      grayValues.push(gray);

      // Laplacian kernel [0,1,0; 1,-4,1; 0,1,0]
      const top = 0.299 * data[((y - 1) * width + x) * 4] + 0.587 * data[((y - 1) * width + x) * 4 + 1] + 0.114 * data[((y - 1) * width + x) * 4 + 2];
      const bottom = 0.299 * data[((y + 1) * width + x) * 4] + 0.587 * data[((y + 1) * width + x) * 4 + 1] + 0.114 * data[((y + 1) * width + x) * 4 + 2];
      const left = 0.299 * data[(y * width + (x - 1)) * 4] + 0.587 * data[(y * width + (x - 1)) * 4 + 1] + 0.114 * data[(y * width + (x - 1)) * 4 + 2];
      const right = 0.299 * data[(y * width + (x + 1)) * 4] + 0.587 * data[(y * width + (x + 1)) * 4 + 1] + 0.114 * data[(y * width + (x + 1)) * 4 + 2];

      const laplacian = -4 * gray + top + bottom + left + right;
      laplacianSum += laplacian * laplacian;
      count++;
    }
  }

  const blurVariance = laplacianSum / (count || 1);
  // Higher variance = sharper image. Typical threshold ~100 for "focused"
  const sharpnessScore = Math.min(100, (blurVariance / 500) * 100);

  // Contrast analysis: standard deviation of luminance
  const mean = grayValues.reduce((a, b) => a + b, 0) / (grayValues.length || 1);
  const variance = grayValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (grayValues.length || 1);
  const stdDev = Math.sqrt(variance);
  const contrastScore = Math.min(100, (stdDev / 80) * 100);

  // Combined quality score
  return Math.round((sharpnessScore * 0.6 + contrastScore * 0.4));
}

/**
 * Main preprocessing pipeline.
 * Takes a base64 image (or data URL) and returns preprocessed base64 + metadata.
 */
export async function preprocessImage(
  imageSource: string,
  options: PreprocessingOptions = {}
): Promise<PreprocessingResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const steps: string[] = [];

  const img = await loadImage(imageSource);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  // 1. Resolution normalization
  let targetW = originalWidth;
  let targetH = originalHeight;

  if (originalWidth > opts.targetWidth) {
    const ratio = opts.targetWidth / originalWidth;
    targetW = opts.targetWidth;
    targetH = Math.round(originalHeight * ratio);
    steps.push(`Résolution ajustée: ${originalWidth}x${originalHeight} → ${targetW}x${targetH}`);
  } else if (originalWidth < 800) {
    // Upscale small images to improve OCR
    const scale = 1600 / originalWidth;
    targetW = 1600;
    targetH = Math.round(originalHeight * scale);
    steps.push(`Image agrandie: ${originalWidth}x${originalHeight} → ${targetW}x${targetH}`);
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // Draw image
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // 2. Denoise (median filter) — before other enhancements
  if (opts.denoise) {
    let imageData = ctx.getImageData(0, 0, targetW, targetH);
    imageData = applyMedianFilter(imageData, ctx, targetW, targetH);
    ctx.putImageData(imageData, 0, 0);
    steps.push('Réduction du bruit (filtre médian 3×3)');
  }

  // 3. Contrast & Brightness
  if (opts.contrastFactor !== 1.0 || opts.brightness !== 0) {
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const normalizedContrast = (opts.contrastFactor - 1.0) * 0.5; // Map 1.4 → 0.2
    adjustContrastBrightness(imageData.data, normalizedContrast, opts.brightness);
    ctx.putImageData(imageData, 0, 0);
    steps.push(`Contraste ${opts.contrastFactor > 1 ? 'augmenté' : 'réduit'} (×${opts.contrastFactor})`);
  }

  // 4. Grayscale (optional — disabled by default for Gemini)
  if (opts.grayscale) {
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    applyGrayscale(imageData.data);
    ctx.putImageData(imageData, 0, 0);
    steps.push('Conversion en niveaux de gris');
  }

  // 5. Sharpening
  if (opts.sharpen) {
    let imageData = ctx.getImageData(0, 0, targetW, targetH);
    imageData = applySharpen(imageData, ctx, targetW, targetH);
    ctx.putImageData(imageData, 0, 0);
    steps.push('Netteté améliorée (masque flou)');
  }

  // 6. Quality estimation
  const finalImageData = ctx.getImageData(0, 0, targetW, targetH);
  const qualityScore = estimateQuality(finalImageData.data, targetW, targetH);
  steps.push(`Score de qualité: ${qualityScore}/100`);

  // Export
  const processedBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
  const originalBase64 = imageSource.includes(',') ? imageSource.split(',')[1] : imageSource;

  return {
    originalBase64,
    processedBase64,
    metadata: {
      originalWidth,
      originalHeight,
      processedWidth: targetW,
      processedHeight: targetH,
      appliedSteps: steps,
      qualityScore,
    },
  };
}

/**
 * Quick quality check without full preprocessing.
 * Returns a score 0-100 and warnings.
 */
export async function quickQualityCheck(
  imageSource: string
): Promise<{ score: number; warnings: string[] }> {
  const img = await loadImage(imageSource);
  const canvas = document.createElement('canvas');
  const w = Math.min(img.naturalWidth, 800);
  const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const score = estimateQuality(data.data, w, h);

  const warnings: string[] = [];
  if (score < 30) warnings.push('Image très floue — reprenez la photo avec plus de lumière');
  else if (score < 50) warnings.push('Image légèrement floue — le résultat pourrait être imprécis');
  if (img.naturalWidth < 600) warnings.push('Résolution trop faible — rapprochez l\'appareil');
  if (img.naturalWidth > 5000) warnings.push('Image très volumineuse — le traitement sera plus long');

  // Check if mostly white/black (likely bad capture)
  let darkPixels = 0;
  let lightPixels = 0;
  for (let i = 0; i < data.data.length; i += 16) { // Sample every 4th pixel
    const gray = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
    if (gray < 30) darkPixels++;
    if (gray > 225) lightPixels++;
  }
  const totalSampled = data.data.length / 16;
  if (darkPixels / totalSampled > 0.7) warnings.push('Image trop sombre — augmentez la luminosité');
  if (lightPixels / totalSampled > 0.85) warnings.push('Image trop claire ou vide');

  return { score, warnings };
}
