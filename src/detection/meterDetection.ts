import { MeterBoundingBox, MeterDetectionResult } from '../types/battery';

export interface FrameQualityMetrics {
  brightness: number; // 0 - 255
  contrast: number; // standard deviation of luminance
  sharpness: number; // Laplacian variance approximation
  isTooDark: boolean;
  isTooBright: boolean;
  isBlurry: boolean;
  hasDisplayRegions: boolean;
}

/**
 * Analyzes video frame canvas pixels to assess illumination, contrast, and sharpness
 */
export function analyzeFrameQuality(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): FrameQualityMetrics {
  const sampleW = Math.min(180, width);
  const sampleH = Math.min(120, height);
  const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imgData.data;

  let sumLuminance = 0;
  const luminances: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sumLuminance += lum;
    luminances.push(lum);
  }

  const meanLum = sumLuminance / luminances.length;

  let varianceSum = 0;
  for (let i = 0; i < luminances.length; i++) {
    const diff = luminances[i] - meanLum;
    varianceSum += diff * diff;
  }
  const contrast = Math.sqrt(varianceSum / luminances.length);

  // Approximate edge sharpness by horizontal pixel gradients
  let edgeEnergy = 0;
  for (let y = 0; y < sampleH; y++) {
    for (let x = 1; x < sampleW; x++) {
      const idx = y * sampleW + x;
      const diff = Math.abs(luminances[idx] - luminances[idx - 1]);
      edgeEnergy += diff;
    }
  }
  const sharpness = edgeEnergy / (sampleW * sampleH);

  return {
    brightness: Math.round(meanLum),
    contrast: Math.round(contrast),
    sharpness: Math.round(sharpness),
    isTooDark: meanLum < 30,
    isTooBright: meanLum > 235,
    isBlurry: sharpness < 3.0,
    hasDisplayRegions: contrast > 30,
  };
}

interface DisplayBoxesResult {
  voltage: MeterBoundingBox;
  current: MeterBoundingBox;
  batteryPercent: MeterBoundingBox;
  statusMessage: string;
}

const DW = 160;
const DH = 120;
const GW = 16;
const GH = 12;

function makeFallbackBoxes(): {
  voltage: MeterBoundingBox;
  current: MeterBoundingBox;
  batteryPercent: MeterBoundingBox;
} {
  return {
    voltage: {
      x: 0.10,
      y: 0.20,
      width: 0.38,
      height: 0.52,
      label: 'Voltage Meter',
      confidence: 0,
    },
    current: {
      x: 0.52,
      y: 0.16,
      width: 0.40,
      height: 0.32,
      label: 'Current Meter',
      confidence: 0,
    },
    batteryPercent: {
      x: 0.52,
      y: 0.52,
      width: 0.40,
      height: 0.30,
      label: 'Battery % Display',
      confidence: 0,
    },
  };
}

function boxesOverlap(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): boolean {
  return !(ax2 < bx1 || bx2 < ax1 || ay2 < by1 || by2 < ay1);
}

function rectIntersectArea(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): number {
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  return (ix2 - ix1) * (iy2 - iy1);
}

/**
 * Automatically scans frame for high-contrast digital display bezels/regions
 * using pixel-based edge-density detection.
 */
export function autodetectDisplayBoxes(
  canvas: HTMLCanvasElement
): DisplayBoxesResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;

  const fallbackBoxes = makeFallbackBoxes();

  if (!ctx || w === 0 || h === 0) {
    return { ...fallbackBoxes, statusMessage: 'Canvas not ready for detection' };
  }

  // Step 1: Downsample to 160x120 grayscale luminance
  const tmp = document.createElement('canvas');
  tmp.width = DW;
  tmp.height = DH;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!tctx) {
    return { ...fallbackBoxes, statusMessage: 'Downsample canvas unavailable' };
  }
  tctx.drawImage(canvas, 0, 0, DW, DH);
  const imgData = tctx.getImageData(0, 0, DW, DH);
  const data = imgData.data;

  const lum = new Float32Array(DW * DH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Step 2: Compute Sobel X+Y gradient magnitude
  const grad = new Float32Array(DW * DH);
  let gradSum = 0;
  for (let y = 1; y < DH - 1; y++) {
    for (let x = 1; x < DW - 1; x++) {
      const i00 = (y - 1) * DW + (x - 1);
      const i01 = i00 + 1;
      const i02 = i00 + 2;
      const i10 = y * DW + (x - 1);
      const i12 = i10 + 2;
      const i20 = (y + 1) * DW + (x - 1);
      const i21 = i20 + 1;
      const i22 = i20 + 2;
      const gx =
        -lum[i00] - 2 * lum[i10] - lum[i20] +
        lum[i02] + 2 * lum[i12] + lum[i22];
      const gy =
        -lum[i00] - 2 * lum[i01] - lum[i02] +
        lum[i20] + 2 * lum[i21] + lum[i22];
      const m = Math.abs(gx) + Math.abs(gy);
      grad[y * DW + x] = m;
      gradSum += m;
    }
  }
  const gradMean = gradSum / (DW * DH);

  // Step 3: Threshold to edge binary map (Otsu-ish: use mean * factor)
  const threshold = Math.max(20, gradMean * 0.6);
  const edgeBinary = new Uint8Array(DW * DH);
  let edgeCount = 0;
  for (let i = 0; i < DW * DH; i++) {
    if (grad[i] > threshold) {
      edgeBinary[i] = 1;
      edgeCount++;
    }
  }
  const edgeDensityGlobal = edgeCount / (DW * DH);

  if (edgeDensityGlobal < 0.015) {
    return { ...fallbackBoxes, statusMessage: 'No high-contrast rectangles found (low edge density)' };
  }

  // Step 4: 16x12 grid cell edge density score
  const cellW = DW / GW;
  const cellH = DH / GH;
  const cellScore = new Float32Array(GW * GH);
  let maxCellScore = 0;
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const sx = Math.floor(gx * cellW);
      const sy = Math.floor(gy * cellH);
      const ex = Math.floor((gx + 1) * cellW);
      const ey = Math.floor((gy + 1) * cellH);
      let cnt = 0;
      for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
          cnt += edgeBinary[y * DW + x];
        }
      }
      const area = (ex - sx) * (ey - sy);
      const s = cnt / area;
      cellScore[gy * GW + gx] = s;
      if (s > maxCellScore) maxCellScore = s;
    }
  }

  if (maxCellScore < 0.06) {
    return { ...fallbackBoxes, statusMessage: 'No high-contrast rectangles found (no dense edge clusters)' };
  }

  // Step 5: Find top-3 non-overlapping rectangular clusters with highest edge density
  // Try rectangular windows varying size and pick top non-overlapping
  const minW = 3;
  const minH = 3;
  const maxW = 10;
  const maxH = 8;

  interface Candidate {
    gx1: number; gy1: number; gx2: number; gy2: number;
    score: number;
    cx: number; cy: number; area: number;
  }
  const candidates: Candidate[] = [];

  for (let cw = maxH; cw >= minW; cw--) {
    for (let ch = maxH; ch >= minH; ch--) {
      for (let gy = 0; gy + ch <= GH; gy++) {
        for (let gx = 0; gx + cw <= GW; gx++) {
          let sum = 0;
          for (let yy = gy; yy < gy + ch; yy++) {
            for (let xx = gx; xx < gx + cw; xx++) {
              sum += cellScore[yy * GW + xx];
            }
          }
          const area = cw * ch;
          const avg = sum / area;
          candidates.push({
            gx1: gx, gy1: gy,
            gx2: gx + cw, gy2: gy + ch,
            score: avg * Math.sqrt(area),
            cx: gx + cw / 2,
            cy: gy + ch / 2,
            area: area,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const picked: Candidate[] = [];
  for (const c of candidates) {
    if (picked.length >= 3) break;
    let ok = true;
    for (const p of picked) {
      const ia = rectIntersectArea(c.gx1, c.gy1, c.gx2, c.gy2, p.gx1, p.gy1, p.gx2, p.gy2);
      const ca = (c.gx2 - c.gx1) * (c.gy2 - c.gy1);
      const pa = (p.gx2 - p.gx1) * (p.gy2 - p.gy1);
      const iou = ia / (ca + pa - ia);
      if (iou > 0.25) { ok = false; break; }
    }
    if (ok) picked.push(c);
  }

  if (picked.length < 2) {
    return { ...fallbackBoxes, statusMessage: 'No high-contrast rectangles found (insufficient clusters)' };
  }

  // Pad with a synthetic third if only 2 found (mirror largest to opposite side)
  while (picked.length < 3) {
    const biggest = picked.slice().sort((a, b) => b.area - a.area)[0];
    const mirrorGx1 = GW - biggest.gx2;
    const mirror = {
      gx1: mirrorGx1 < 0 ? 0 : mirrorGx1,
      gy1: biggest.gy1,
      gx2: mirrorGx1 + (biggest.gx2 - biggest.gx1),
      gy2: biggest.gy2,
      score: biggest.score * 0.5,
      cx: (mirrorGx1 < 0 ? 0 : mirrorGx1) + (biggest.gx2 - biggest.gx1) / 2,
      cy: biggest.cy,
      area: biggest.area,
    };
    if (mirror.gx2 > GW) mirror.gx2 = GW;
    picked.push(mirror);
  }

  // Step 6: Order as voltage (left/big), current (right/top), battery (right/bottom)
  const halfX = GW / 2;
  const leftBoxes = picked.filter(b => b.cx < halfX);
  const rightBoxes = picked.filter(b => b.cx >= halfX);

  let voltageBox: Candidate | null = null;
  let currentBox: Candidate | null = null;
  let batteryBox: Candidate | null = null;

  if (leftBoxes.length > 0) {
    voltageBox = leftBoxes.sort((a, b) => b.area - a.area)[0];
  } else {
    voltageBox = picked.sort((a, b) => b.area - a.area)[0];
  }
  const remaining = picked.filter(b => b !== voltageBox);
  const rightRemaining = remaining.filter(b => b.cx >= halfX);

  if (rightRemaining.length >= 2) {
    const sorted = rightRemaining.slice().sort((a, b) => a.cy - b.cy);
    currentBox = sorted[0];
    batteryBox = sorted[1];
  } else if (rightRemaining.length === 1) {
    currentBox = rightRemaining[0];
    const rest = remaining.filter(b => b !== currentBox);
    batteryBox = rest[0] || currentBox;
  } else {
    const sorted = remaining.slice().sort((a, b) => a.cy - b.cy);
    currentBox = sorted[0] || voltageBox;
    batteryBox = sorted[1] || currentBox;
  }

  function candidateToBox(c: Candidate, label: 'Voltage Meter' | 'Current Meter' | 'Battery % Display'): MeterBoundingBox {
    const pad = 0.3;
    const cw = c.gx2 - c.gx1;
    const ch = c.gy2 - c.gy1;
    const nx1 = Math.max(0, c.gx1 - cw * pad);
    const ny1 = Math.max(0, c.gy1 - ch * pad);
    const nx2 = Math.min(GW, c.gx2 + cw * pad);
    const ny2 = Math.min(GH, c.gy2 + ch * pad);
    return {
      x: nx1 / GW,
      y: ny1 / GH,
      width: (nx2 - nx1) / GW,
      height: (ny2 - ny1) / GH,
      label,
      confidence: Math.min(95, Math.round(30 + c.score * 400)),
    };
  }

  const voltage = candidateToBox(voltageBox, 'Voltage Meter');
  const current = candidateToBox(currentBox, 'Current Meter');
  const batteryPercent = candidateToBox(batteryBox, 'Battery % Display');

  return {
    voltage,
    current,
    batteryPercent,
    statusMessage: `Auto-detected ${picked.length} meter region(s) via edge density`,
  };
}

/**
 * Performs automatic meter detection on the live video canvas
 */
export function detectMetersOnFrame(
  canvas: HTMLCanvasElement,
  fallbackBoxes?: {
    voltage: MeterBoundingBox;
    current: MeterBoundingBox;
    batteryPercent: MeterBoundingBox;
  }
): MeterDetectionResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return {
      allMetersDetected: false,
      overallConfidence: 0,
      statusMessage: 'Camera Not Ready',
    };
  }

  const quality = analyzeFrameQuality(ctx, canvas.width, canvas.height);

  if (quality.isTooDark) {
    return {
      allMetersDetected: false,
      overallConfidence: 15,
      statusMessage: 'Lighting low: Increase illumination on meter displays',
    };
  }

  if (quality.isTooBright) {
    return {
      allMetersDetected: false,
      overallConfidence: 20,
      statusMessage: 'Glare detected: Adjust camera angle to prevent direct reflection',
    };
  }

  if (quality.isBlurry) {
    return {
      allMetersDetected: false,
      overallConfidence: 30,
      statusMessage: 'Blurry frame: Focus camera onto meter digits',
    };
  }

  let autodetectedStatus = '';
  let boxes;
  if (fallbackBoxes) {
    boxes = fallbackBoxes;
    autodetectedStatus = 'Using calibrated meter boxes';
  } else {
    const autoResult = autodetectDisplayBoxes(canvas);
    boxes = {
      voltage: autoResult.voltage,
      current: autoResult.current,
      batteryPercent: autoResult.batteryPercent,
    };
    autodetectedStatus = autoResult.statusMessage;
  }

  const anyZeroConf =
    boxes.voltage.confidence === 0 ||
    boxes.current.confidence === 0 ||
    boxes.batteryPercent.confidence === 0;

  const baseConfidence = anyZeroConf
    ? 0
    : Math.min(99, Math.max(50, Math.round(quality.contrast * 1.4 + quality.sharpness * 3.5)));

  const vBox: MeterBoundingBox = {
    ...boxes.voltage,
    confidence: anyZeroConf ? boxes.voltage.confidence : baseConfidence,
  };

  const cBox: MeterBoundingBox = {
    ...boxes.current,
    confidence: anyZeroConf ? boxes.current.confidence : Math.round(baseConfidence * 0.96),
  };

  const pBox: MeterBoundingBox = {
    ...boxes.batteryPercent,
    confidence: anyZeroConf ? boxes.batteryPercent.confidence : Math.round(baseConfidence * 0.94),
  };

  const avgConf = Math.round((vBox.confidence + cBox.confidence + pBox.confidence) / 3);
  const allDetected = quality.hasDisplayRegions && !anyZeroConf;

  let finalStatus;
  if (!quality.hasDisplayRegions) {
    finalStatus = 'Searching for Meters in Frame';
  } else if (anyZeroConf) {
    finalStatus = autodetectedStatus;
  } else {
    finalStatus = `Meters Detected & Aligned — ${autodetectedStatus}`;
  }

  return {
    voltageMeterBox: vBox,
    currentMeterBox: cBox,
    batteryPercentBox: pBox,
    allMetersDetected: allDetected,
    overallConfidence: avgConf,
    statusMessage: finalStatus,
  };
}
