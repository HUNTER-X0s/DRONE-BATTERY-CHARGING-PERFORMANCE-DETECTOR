import { MeterBoundingBox, RawOcrValue, ValidationStatus } from '../types/battery';

export interface OcrDetectionBoxResult {
  value: number | null;
  rawString: string;
  confidence: number;
  valid: boolean;
  digitCount: number;
  hasDecimal: boolean;
  contrastRatio: number;
  polarity: 'LED_BRIGHT_ON_DARK' | 'LCD_DARK_ON_LIGHT' | 'UNKNOWN';
}

export interface MultiFrameValidationResult {
  isStable: boolean;
  stableValue: number | null;
  validationStatus: ValidationStatus;
  consecutiveMatches: number;
  warning?: string;
}

/**
 * Standard 7-Segment digit bitmasks: [a, b, c, d, e, f, g]
 *   -- a --
 *  |       |
 *  f       b
 *  |       |
 *   -- g --
 *  |       |
 *  e       c
 *  |       |
 *   -- d --
 */
const SEVEN_SEGMENT_TEMPLATES: Record<number, number[]> = {
  0: [1, 1, 1, 1, 1, 1, 0],
  1: [0, 1, 1, 0, 0, 0, 0],
  2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1],
  4: [0, 1, 1, 0, 0, 1, 1],
  5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1],
  7: [1, 1, 1, 0, 0, 0, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
};

/**
 * Evaluates whether a segment region is actively lit or dark
 */
function sampleSegmentBrightness(
  data: Uint8ClampedArray,
  canvasWidth: number,
  startX: number,
  startY: number,
  boxW: number,
  boxH: number,
  relX1: number,
  relY1: number,
  relX2: number,
  relY2: number,
  threshold: number,
  isLed: boolean
): number {
  const p1x = Math.floor(startX + relX1 * boxW);
  const p1y = Math.floor(startY + relY1 * boxH);
  const p2x = Math.floor(startX + relX2 * boxW);
  const p2y = Math.floor(startY + relY2 * boxH);

  let activeCount = 0;
  let totalCount = 0;

  const minX = Math.min(p1x, p2x);
  const maxX = Math.max(p1x, p2x);
  const minY = Math.min(p1y, p2y);
  const maxY = Math.max(p1y, p2y);

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (px >= 0 && px < canvasWidth && py >= 0) {
        const idx = (py * canvasWidth + px) * 4;
        if (idx + 2 < data.length) {
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const isActive = isLed ? lum > threshold : lum < threshold;
          if (isActive) activeCount++;
          totalCount++;
        }
      }
    }
  }

  return totalCount > 0 ? activeCount / totalCount : 0;
}

/**
 * Classifies a candidate digit box into 0-9 using 7-segment optical sampling
 */
function decodeSevenSegmentCandidate(
  data: Uint8ClampedArray,
  canvasWidth: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  threshold: number,
  isLed: boolean
): { digit: number; confidence: number } | null {
  if (boxW < 8 || boxH < 12) return null;

  // 7 segment sampling geometry [relX1, relY1, relX2, relY2]
  const segmentGeometries: [number, number, number, number][] = [
    [0.25, 0.08, 0.75, 0.16], // a (top bar)
    [0.72, 0.18, 0.92, 0.44], // b (top right bar)
    [0.72, 0.56, 0.92, 0.82], // c (bottom right bar)
    [0.25, 0.84, 0.75, 0.92], // d (bottom bar)
    [0.08, 0.56, 0.28, 0.82], // e (bottom left bar)
    [0.08, 0.18, 0.28, 0.44], // f (top left bar)
    [0.25, 0.46, 0.75, 0.54], // g (middle bar)
  ];

  const measuredBits: number[] = [];
  let sumScore = 0;

  for (const [x1, y1, x2, y2] of segmentGeometries) {
    const activationRatio = sampleSegmentBrightness(
      data,
      canvasWidth,
      boxX,
      boxY,
      boxW,
      boxH,
      x1,
      y1,
      x2,
      y2,
      threshold,
      isLed
    );
    // Active if more than 35% of sample pixels meet threshold
    measuredBits.push(activationRatio > 0.35 ? 1 : 0);
    sumScore += activationRatio;
  }

  // All 0s means empty/blank area
  const activeBitsCount = measuredBits.filter((b) => b === 1).length;
  if (activeBitsCount < 2) {
    return null;
  }

  // Match against standard 7-segment bitmasks
  let bestDigit: number | null = null;
  let minHammingDistance = 999;

  for (let d = 0; d <= 9; d++) {
    const template = SEVEN_SEGMENT_TEMPLATES[d];
    let distance = 0;
    for (let s = 0; s < 7; s++) {
      if (template[s] !== measuredBits[s]) {
        distance++;
      }
    }
    if (distance < minHammingDistance) {
      minHammingDistance = distance;
      bestDigit = d;
    }
  }

  // Exact match (0 errors) -> high confidence 96%
  // 1-bit discrepancy -> acceptable match 75%
  // 2+ bit discrepancy -> rejected (noise or non-digit)
  if (bestDigit !== null && minHammingDistance <= 1) {
    const confidence = minHammingDistance === 0 ? 96 : 75;
    return { digit: bestDigit, confidence };
  }

  return null;
}

/**
 * Extracts and validates numeric meter readings from a calibrated bounding box.
 * Zero random numbers: strictly returns null if no valid digits are detected.
 */
export function extractBoxValue(
  sourceCanvas: HTMLCanvasElement,
  box: MeterBoundingBox,
  targetType: 'voltage' | 'current' | 'percent',
  expectedMin: number,
  expectedMax: number
): OcrDetectionBoxResult {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
    return {
      value: null,
      rawString: '',
      confidence: 0,
      valid: false,
      digitCount: 0,
      hasDecimal: false,
      contrastRatio: 0,
      polarity: 'UNKNOWN',
    };
  }

  const sx = Math.max(0, Math.floor(box.x * sourceCanvas.width));
  const sy = Math.max(0, Math.floor(box.y * sourceCanvas.height));
  const sw = Math.min(sourceCanvas.width - sx, Math.floor(box.width * sourceCanvas.width));
  const sh = Math.min(sourceCanvas.height - sy, Math.floor(box.height * sourceCanvas.height));

  if (sw < 20 || sh < 16) {
    return {
      value: null,
      rawString: '',
      confidence: 0,
      valid: false,
      digitCount: 0,
      hasDecimal: false,
      contrastRatio: 0,
      polarity: 'UNKNOWN',
    };
  }

  const fullImageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const fullData = fullImageData.data;

  // 1. Analyze Luminance Histogram inside target bounding box
  let minLum = 255;
  let maxLum = 0;
  let sumLum = 0;
  const count = sw * sh;

  for (let py = sy; py < sy + sh; py++) {
    for (let px = sx; px < sx + sw; px++) {
      const idx = (py * sourceCanvas.width + px) * 4;
      const lum = 0.299 * fullData[idx] + 0.587 * fullData[idx + 1] + 0.114 * fullData[idx + 2];
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      sumLum += lum;
    }
  }

  const avgLum = count > 0 ? sumLum / count : 128;
  const contrast = maxLum - minLum;

  // If contrast is flat (< 35 on a 255 scale), display is either turned off, obscured, or blank
  if (contrast < 35) {
    return {
      value: null,
      rawString: '',
      confidence: 0,
      valid: false,
      digitCount: 0,
      hasDecimal: false,
      contrastRatio: Math.round(contrast),
      polarity: 'UNKNOWN',
    };
  }

  // 2. Polarity Detection (LED: bright digits on dark vs LCD: dark digits on bright)
  const isLed = avgLum < (minLum + maxLum) / 2;
  const polarity: 'LED_BRIGHT_ON_DARK' | 'LCD_DARK_ON_LIGHT' = isLed
    ? 'LED_BRIGHT_ON_DARK'
    : 'LCD_DARK_ON_LIGHT';

  // Dynamic threshold separating active segments from background
  const threshold = isLed
    ? minLum + contrast * 0.45
    : minLum + contrast * 0.55;

  // 3. Segment horizontal column projection to isolate digit glyphs
  const colDensity = new Float32Array(sw);
  for (let x = 0; x < sw; x++) {
    let activeY = 0;
    for (let y = 0; y < sh; y++) {
      const idx = ((sy + y) * sourceCanvas.width + (sx + x)) * 4;
      const lum = 0.299 * fullData[idx] + 0.587 * fullData[idx + 1] + 0.114 * fullData[idx + 2];
      const isActive = isLed ? lum > threshold : lum < threshold;
      if (isActive) activeY++;
    }
    colDensity[x] = activeY / sh;
  }

  // 4. Find digit candidate spans
  const spans: { start: number; end: number }[] = [];
  let inDigit = false;
  let startX = 0;

  for (let x = 0; x < sw; x++) {
    const isColumnActive = colDensity[x] > 0.12;
    if (isColumnActive && !inDigit) {
      inDigit = true;
      startX = x;
    } else if (!isColumnActive && inDigit) {
      inDigit = false;
      const spanW = x - startX;
      // Filter out single pixel noise lines
      if (spanW >= 5 && spanW <= sw * 0.50) {
        spans.push({ start: startX, end: x });
      }
    }
  }
  if (inDigit && sw - startX >= 5) {
    spans.push({ start: startX, end: sw });
  }

  // 5. Decode digits & detect decimal dot
  const recognizedDigits: { digit: number; confidence: number; x: number; width: number }[] = [];
  let opticalDecimalDetected = false;
  let decimalPosition = -1; // index after which decimal appears

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const spanW = span.end - span.start;

    // Check if this span is a tiny dot near the bottom (decimal point)
    if (spanW < 10 && i > 0 && i < spans.length) {
      // Sample bottom area to verify dot
      const dotActivation = sampleSegmentBrightness(
        fullData,
        sourceCanvas.width,
        sx + span.start,
        sy,
        spanW,
        sh,
        0.0,
        0.75,
        1.0,
        0.98,
        threshold,
        isLed
      );
      if (dotActivation > 0.3) {
        opticalDecimalDetected = true;
        decimalPosition = recognizedDigits.length;
        continue;
      }
    }

    const decoded = decodeSevenSegmentCandidate(
      fullData,
      sourceCanvas.width,
      sx + span.start,
      sy,
      spanW,
      sh,
      threshold,
      isLed
    );

    if (decoded) {
      recognizedDigits.push({
        digit: decoded.digit,
        confidence: decoded.confidence,
        x: span.start,
        width: spanW,
      });
    }
  }

  if (recognizedDigits.length === 0) {
    return {
      value: null,
      rawString: '',
      confidence: 0,
      valid: false,
      digitCount: 0,
      hasDecimal: false,
      contrastRatio: Math.round(contrast),
      polarity,
    };
  }

  // 6. Assemble recognized string with strict validation
  let digitString = '';
  let totalConfidence = 0;

  for (let i = 0; i < recognizedDigits.length; i++) {
    digitString += recognizedDigits[i].digit.toString();
    totalConfidence += recognizedDigits[i].confidence;
    if (opticalDecimalDetected && i + 1 === decimalPosition) {
      digitString += '.';
    }
  }

  const avgConfidence = Math.round(totalConfidence / recognizedDigits.length);
  let parsedValue = parseFloat(digitString);

  // 7. Format & Decimal Consistency Logic
  let hasValidDecimal = opticalDecimalDetected;

  if (isNaN(parsedValue)) {
    return {
      value: null,
      rawString: digitString,
      confidence: avgConfidence,
      valid: false,
      digitCount: recognizedDigits.length,
      hasDecimal: false,
      contrastRatio: Math.round(contrast),
      polarity,
    };
  }

  // If no optical decimal dot was detected, apply physical bench meter formatting:
  if (!opticalDecimalDetected) {
    if (targetType === 'voltage') {
      // 4S/6S drone voltage meters show e.g. 1485 -> 14.85V, 2220 -> 22.20V
      if (parsedValue > 60 && parsedValue < 6000) {
        if (digitString.length >= 4) {
          parsedValue = parsedValue / 100;
          digitString = parsedValue.toFixed(2);
          hasValidDecimal = true;
        } else if (digitString.length === 3) {
          parsedValue = parsedValue / 10;
          digitString = parsedValue.toFixed(1);
          hasValidDecimal = true;
        }
      }
    } else if (targetType === 'current') {
      // Charger current meters show e.g. 480 -> 4.80A, 50 -> 0.50A
      if (parsedValue > 35 && parsedValue < 3500) {
        parsedValue = parsedValue / 100;
        digitString = parsedValue.toFixed(2);
        hasValidDecimal = true;
      }
    } else if (targetType === 'percent') {
      // Battery % is integer 0-100
      parsedValue = Math.round(parsedValue);
      digitString = parsedValue.toString();
    }
  }

  // 8. Strict Bounds Check
  const inRange = parsedValue >= expectedMin && parsedValue <= expectedMax;

  if (inRange) {
    return {
      value: Number(parsedValue.toFixed(targetType === 'percent' ? 0 : 2)),
      rawString: digitString,
      confidence: avgConfidence,
      valid: true,
      digitCount: recognizedDigits.length,
      hasDecimal: hasValidDecimal,
      contrastRatio: Math.round(contrast),
      polarity,
    };
  }

  return {
    value: null,
    rawString: digitString,
    confidence: Math.max(10, avgConfidence - 40),
    valid: false,
    digitCount: recognizedDigits.length,
    hasDecimal: hasValidDecimal,
    contrastRatio: Math.round(contrast),
    polarity,
  };
}

/**
 * Multi-frame temporal validator to prevent flickering, false spikes, or random artifacts.
 * A reading is only confirmed when observed across frames with high physical consistency.
 */
export class OcrTemporalValidator {
  private history: {
    voltage: (number | null)[];
    current: (number | null)[];
    percent: (number | null)[];
    timestamp: number[];
  } = {
    voltage: [],
    current: [],
    percent: [],
    timestamp: [],
  };

  private maxHistoryLength = 5;

  pushObservation(v: number | null, i: number | null, p: number | null) {
    this.history.voltage.push(v);
    this.history.current.push(i);
    this.history.percent.push(p);
    this.history.timestamp.push(Date.now());

    if (this.history.voltage.length > this.maxHistoryLength) {
      this.history.voltage.shift();
      this.history.current.shift();
      this.history.percent.shift();
      this.history.timestamp.shift();
    }
  }

  validateStream(
    candidateV: number | null,
    candidateI: number | null,
    candidateP: number | null
  ): {
    voltage: MultiFrameValidationResult;
    current: MultiFrameValidationResult;
    percent: MultiFrameValidationResult;
  } {
    this.pushObservation(candidateV, candidateI, candidateP);

    const vResult = this.checkMetricStability(this.history.voltage, candidateV, 0.15, 'Voltage', 0, 60);
    const iResult = this.checkMetricStability(this.history.current, candidateI, 0.15, 'Current', 0, 35);
    const pResult = this.checkMetricStability(this.history.percent, candidateP, 2, 'Battery %', 0, 100);

    return {
      voltage: vResult,
      current: iResult,
      percent: pResult,
    };
  }

  private checkMetricStability(
    history: (number | null)[],
    latest: number | null,
    tolerance: number,
    label: string,
    minVal: number,
    maxVal: number
  ): MultiFrameValidationResult {
    if (latest === null) {
      return {
        isStable: false,
        stableValue: null,
        validationStatus: 'Missing',
        consecutiveMatches: 0,
        warning: `No valid ${label} digits detected on display.`,
      };
    }

    if (latest < minVal || latest > maxVal) {
      return {
        isStable: false,
        stableValue: null,
        validationStatus: 'Low Confidence',
        consecutiveMatches: 0,
        warning: `${label} value (${latest}) is outside expected physical range (${minVal}-${maxVal}).`,
      };
    }

    // Count recent observations within tolerance
    let matches = 0;
    for (let idx = history.length - 1; idx >= 0; idx--) {
      const past = history[idx];
      if (past !== null && Math.abs(past - latest) <= tolerance) {
        matches++;
      } else {
        break;
      }
    }

    // If seen in at least 2 consecutive frames, verify
    if (matches >= 2) {
      return {
        isStable: true,
        stableValue: latest,
        validationStatus: 'Verified',
        consecutiveMatches: matches,
      };
    }

    // First frame observation: marked as unverified until confirmed by subsequent frame
    return {
      isStable: false,
      stableValue: latest,
      validationStatus: 'Unverified',
      consecutiveMatches: matches,
      warning: `Verifying optical stability of ${label} reading (${latest})...`,
    };
  }

  reset() {
    this.history = {
      voltage: [],
      current: [],
      percent: [],
      timestamp: [],
    };
  }

  getAllStatuses(): {
    voltage: ValidationStatus;
    current: ValidationStatus;
    battery: ValidationStatus;
    overall: ValidationStatus;
  } {
    const statusOrder: ValidationStatus[] = ['Missing', 'Low Confidence', 'Unverified', 'Verified'];
    const rank = (s: ValidationStatus) => statusOrder.indexOf(s);

    const latest = (key: 'voltage' | 'current' | 'percent'): ValidationStatus => {
      const arr = this.history[key];
      if (arr.length === 0) return 'Missing';
      const last = arr[arr.length - 1];
      if (last === null) return 'Missing';
      const stable = this.checkMetricStability(
        arr,
        last,
        key === 'percent' ? 2 : 0.15,
        key === 'voltage' ? 'Voltage' : key === 'current' ? 'Current' : 'Battery %',
        key === 'voltage' ? 0 : key === 'current' ? 0 : 0,
        key === 'voltage' ? 60 : key === 'current' ? 35 : 100
      );
      return stable.validationStatus;
    };

    const v = latest('voltage');
    const i = latest('current');
    const p = latest('percent');
    const overall = [v, i, p].reduce<ValidationStatus>(
      (worst, s) => (rank(s) < rank(worst) ? s : worst),
      'Verified'
    );

    return { voltage: v, current: i, battery: p, overall };
  }
}

/**
 * Validates physical consistency of reading numbers against battery physics
 */
export function validatePhysicalReadings(
  voltage: number,
  current: number,
  batteryPercentage: number,
  prevReading?: { voltage: number; current: number; batteryPercentage: number; timestampMs: number }
): { validationStatus: ValidationStatus; warning?: string; confidenceAdjustment: number } {
  // Check physical drone bounds
  if (voltage < 0 || voltage > 60) {
    return {
      validationStatus: 'Low Confidence',
      warning: `Voltage ${voltage}V is outside plausible drone battery range (0-60V).`,
      confidenceAdjustment: -40,
    };
  }

  if (current < 0 || current > 35) {
    return {
      validationStatus: 'Low Confidence',
      warning: `Current ${current}A is outside plausible charger output range (0-35A).`,
      confidenceAdjustment: -30,
    };
  }

  if (batteryPercentage < 0 || batteryPercentage > 100) {
    return {
      validationStatus: 'Low Confidence',
      warning: `Battery SoC ${batteryPercentage}% is outside 0-100% boundary.`,
      confidenceAdjustment: -50,
    };
  }

  // Rate of change checks if previous reading exists
  if (prevReading) {
    const dtSeconds = Math.max(1, (Date.now() - prevReading.timestampMs) / 1000);
    const vDelta = Math.abs(voltage - prevReading.voltage);
    const pDelta = batteryPercentage - prevReading.batteryPercentage;

    // Terminal voltage shouldn't jump > 1.8V in a few seconds unless disconnected
    if (vDelta > 1.8 && dtSeconds < 10) {
      return {
        validationStatus: 'Low Confidence',
        warning: `Sudden voltage jump of ${vDelta.toFixed(2)}V detected. Review reading.`,
        confidenceAdjustment: -25,
      };
    }

    // Battery percentage shouldn't decrease significantly during charging
    if (pDelta < -2) {
      return {
        validationStatus: 'Low Confidence',
        warning: `Battery percentage dropped from ${prevReading.batteryPercentage}% to ${batteryPercentage}%.`,
        confidenceAdjustment: -35,
      };
    }

    // Battery percentage shouldn't jump by > 5% in a few seconds
    if (pDelta > 5 && dtSeconds < 15) {
      return {
        validationStatus: 'Low Confidence',
        warning: `Sudden battery percentage jump (+${pDelta}% in ${Math.round(dtSeconds)}s).`,
        confidenceAdjustment: -20,
      };
    }
  }

  return {
    validationStatus: 'Verified',
    confidenceAdjustment: 0,
  };
}
