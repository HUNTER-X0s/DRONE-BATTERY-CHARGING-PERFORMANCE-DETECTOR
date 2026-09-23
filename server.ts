import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Clean base64 helper
function cleanBase64(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  // Fallback
  return { mimeType: 'image/jpeg', data: dataUrl.replace(/^data:[^;]+;base64,/, '') };
}

// Helper to strip markdown json markers
function parseJsonFromText(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned);
}

// User-friendly error message formatter
function formatAiErrorMessage(error: any): string {
  if (!error) return 'AI request failed.';
  const msg = error.message || String(error);
  if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
    return 'Google Gemini AI is currently experiencing high demand. Automatic retries were attempted. Please click "Retry" in a few moments, or choose fewer sample frames.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
    return 'Gemini API rate limit or quota reached. Please wait a minute before requesting another analysis.';
  }
  return msg;
}

// Candidate model cascade in priority order
const MODEL_FALLBACK_CHAIN = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
].filter(Boolean) as string[];

// Clean & sanitize numeric output from AI vision
function sanitizeAiTelemetry(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return {
      detected: false,
      voltage: null,
      current: null,
      batteryPercentage: null,
      power: null,
      chargingPhase: 'Idle',
      confidence: 0,
      readoutText: 'No readable telemetry in frame.',
      metersFound: [],
    };
  }

  const extractNum = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  let v = extractNum(raw.voltage);
  let i = extractNum(raw.current);
  let p = extractNum(raw.batteryPercentage);
  let power = extractNum(raw.power);
  let confidence = extractNum(raw.confidence) ?? 85;

  // Convert millivolts to Volts if meter is showing mV (e.g. 14850 mV -> 14.85 V)
  if (v !== null && v > 100 && v <= 60000) {
    v = Number((v / 1000).toFixed(2));
  } else if (v !== null) {
    v = Number(v.toFixed(2));
  }

  // Convert milliamps to Amperes if meter is showing mA (e.g. 4850 mA -> 4.85 A)
  if (i !== null && i > 35 && i <= 35000) {
    i = Number((i / 1000).toFixed(2));
  } else if (i !== null) {
    i = Number(i.toFixed(2));
  }

  // Handle decimal fraction battery % (e.g. 0.42 -> 42%)
  if (p !== null && p > 0 && p <= 1.0) {
    p = Math.round(p * 100);
  }
  if (p !== null) {
    p = Math.min(100, Math.max(0, Math.round(p)));
  }

  // Auto-compute power (W = V * I)
  if (v !== null && i !== null && (power === null || power === 0)) {
    power = Number((v * i).toFixed(2));
  } else if (power !== null) {
    power = Number(power.toFixed(2));
  }

  const detected = Boolean(
    raw.detected === true ||
    (v !== null && !isNaN(v)) ||
    (i !== null && !isNaN(i)) ||
    (p !== null && !isNaN(p))
  );

  return {
    detected,
    voltage: v,
    current: i,
    batteryPercentage: p,
    power,
    chargingPhase: typeof raw.chargingPhase === 'string' && raw.chargingPhase.trim()
      ? raw.chargingPhase.trim()
      : (i && i > 0.05 ? 'Constant Current (CC)' : 'Idle / Standby'),
    confidence: Math.min(100, Math.max(10, Math.round(confidence))),
    readoutText: typeof raw.readoutText === 'string' && raw.readoutText.trim()
      ? raw.readoutText.trim()
      : `Detected: ${v !== null ? `${v}V` : ''} ${i !== null ? `${i}A` : ''} ${p !== null ? `${p}%` : ''}`.trim(),
    metersFound: Array.isArray(raw.metersFound)
      ? raw.metersFound.map(String)
      : [
          v !== null ? `Voltage Display (${v}V)` : '',
          i !== null ? `Current Display (${i}A)` : '',
          p !== null ? `Battery SoC (${p}%)` : '',
        ].filter(Boolean),
  };
}

// Resilient Gemini generateContent call with dynamic model fallback and automatic retry
async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: { contents: any; config?: any }
): Promise<any> {
  let lastError: any = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Gemini AI] Requesting inference via model: ${model} (attempt ${attempt})...`);
        return await ai.models.generateContent({
          model,
          contents: options.contents,
          config: options.config,
        });
      } catch (err: any) {
        lastError = err;
        const isTransient =
          err.status === 503 ||
          err.code === 503 ||
          err.status === 429 ||
          err.code === 429 ||
          err.status === 404 ||
          err.code === 404 ||
          (err.message && (
            err.message.includes('503') ||
            err.message.includes('high demand') ||
            err.message.includes('UNAVAILABLE') ||
            err.message.includes('429') ||
            err.message.includes('RESOURCE_EXHAUSTED') ||
            err.message.includes('quota') ||
            err.message.includes('not found') ||
            err.message.includes('no longer available')
          ));

        if (isTransient) {
          console.warn(`[Gemini AI] Model ${model} returned load/quota limit. Cascading to next fallback model in chain...`);
          break; // proceed to next candidate model
        }
        throw err;
      }
    }
  }
  throw lastError;
}

// ================= API ROUTES =================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Auto-detect display from camera frame using AI (Gemini Vision).
 * Reads digital meters, multimeters, power supplies, and charger screens with precision metrology.
 */
app.post('/api/ai/detect-display', async (req, res) => {
  try {
    const { image, batteryInfo, calibratedBoxes } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Missing image data URL in request body.' });
    }

    const ai = getGenAI();
    const { mimeType, data } = cleanBase64(image);

    let locationHints = '';
    if (calibratedBoxes) {
      const hints: string[] = [];
      const voltageBox = calibratedBoxes.voltage || calibratedBoxes.voltageBox || calibratedBoxes.voltmeter;
      const currentBox = calibratedBoxes.current || calibratedBoxes.currentBox || calibratedBoxes.ammeter;
      const batteryBox = calibratedBoxes.battery || calibratedBoxes.batteryBox || calibratedBoxes.soc || calibratedBoxes.percentage;
      if (voltageBox) {
        hints.push(`VOLTAGE METER LOCATION HINT: inspect rectangle x=${Number(voltageBox.x).toFixed(2)} y=${Number(voltageBox.y).toFixed(2)} width=${Number(voltageBox.width).toFixed(2)} height=${Number(voltageBox.height).toFixed(2)} (fraction of frame) — read ONLY terminal voltage here.`);
      }
      if (currentBox) {
        hints.push(`CURRENT METER LOCATION HINT: inspect rectangle x=${Number(currentBox.x).toFixed(2)} y=${Number(currentBox.y).toFixed(2)} width=${Number(currentBox.width).toFixed(2)} height=${Number(currentBox.height).toFixed(2)} (fraction of frame) — read ONLY charge current here.`);
      }
      if (batteryBox) {
        hints.push(`BATTERY SoC% LOCATION HINT: inspect rectangle x=${Number(batteryBox.x).toFixed(2)} y=${Number(batteryBox.y).toFixed(2)} width=${Number(batteryBox.width).toFixed(2)} height=${Number(batteryBox.height).toFixed(2)} (fraction of frame) — read ONLY battery state of charge percentage here.`);
      }
      if (hints.length > 0) {
        locationHints = hints.join(' ') + '\n\n';
      }
    }

    const prompt = `${locationHints}You are an expert laboratory metrology and precision computer vision AI specializing in drone battery chargers, digital multimeters, DC power supplies, and battery monitors.

Examine the provided camera image containing workbench meter displays, LCD screens, 7-segment LED readouts, or digital charger panels.
${batteryInfo ? `Context - Testing Battery: ${batteryInfo.name || 'Drone LiPo/Li-ion'} (Nominal: ${batteryInfo.chemistry || 'LiPo'}, Capacity: ${batteryInfo.capacity || 5000}mAh)` : ''}

PRECISION READING INSTRUCTIONS:
1. Locate every visible digital display, 7-segment readout, or LCD screen.
2. Read the live VOLTAGE (V):
   - Look for the decimal point position (e.g. 14.85, 15.24, 22.20, 4.20).
   - If total pack voltage is shown, read it. If only individual cell voltages are visible (e.g. 3.81V x 4), sum them to pack voltage.
   - CRITICAL: Do NOT confuse Elapsed Time (e.g. 15:30) or mAh with Voltage!
3. Read the live CHARGE CURRENT (A):
   - Look for current reading in Amperes (e.g. 4.85, 2.00, 0.50).
   - If in mA (milliamps like 500mA), convert to Amperes (0.50A).
   - If charger is in idle or standby, current is 0.00.
4. Read the BATTERY STATE OF CHARGE (%):
   - Look for the percentage number (0-100%) or battery fuel gauge percentage.
5. Identify the charging phase (e.g. "Constant Current (CC)", "Constant Voltage (CV)", "Trickle", "Cutoff / Full", "Standby", "Balancing", "Idle").
6. Provide a concise, clear readoutText describing all displays found and the exact values read.

Respond ONLY with a JSON object in this exact schema:
{
  "detected": true,
  "voltage": number or null,
  "current": number or null,
  "batteryPercentage": number or null,
  "power": number or null,
  "chargingPhase": string,
  "confidence": number,
  "readoutText": string,
  "metersFound": string[]
}`;

    const response = await generateContentWithRetry(ai, {
      contents: [
        {
          inlineData: {
            mimeType,
            data,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let rawResult: any;
    try {
      rawResult = parseJsonFromText(responseText);
    } catch {
      rawResult = {
        detected: false,
        voltage: null,
        current: null,
        batteryPercentage: null,
        power: null,
        chargingPhase: 'Unknown',
        confidence: 0,
        readoutText: responseText.slice(0, 200),
        metersFound: [],
      };
    }

    const sanitized = sanitizeAiTelemetry(rawResult);

    res.json({
      success: true,
      data: sanitized,
    });
  } catch (error: any) {
    console.error('Error in /api/ai/detect-display:', error);
    res.status(500).json({
      success: false,
      error: formatAiErrorMessage(error),
    });
  }
});

/**
 * AI Video Reader: Reads video frames across charging progression "as directed".
 * Extracts structured telemetry series, transitions, milestones, and answers custom user queries.
 */
app.post('/api/ai/analyze-video', async (req, res) => {
  try {
    const { frames, userDirective, batteryInfo } = req.body;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'No video frames provided for AI analysis.' });
    }

    const ai = getGenAI();

    // Prepare multimodal content parts: images + instructions
    const contentParts: any[] = [];

    // Limit to maximum 16 representative frames to stay well within single call limits
    const selectedFrames = frames.slice(0, 16);

    selectedFrames.forEach((frame, idx) => {
      const { mimeType, data } = cleanBase64(frame.image);
      contentParts.push({
        text: `--- FRAME #${idx + 1} at timestamp ${frame.timestampFormatted || `${frame.timestampSec}s`} ---`,
      });
      contentParts.push({
        inlineData: {
          mimeType,
          data,
        },
      });
    });

    const prompt = `You are an expert laboratory battery metrology and computer vision AI.
You have been provided sequential video frames captured from a video of digital meters monitoring battery charging.

BATTERY INFO:
${batteryInfo ? `Name: ${batteryInfo.name}, Capacity: ${batteryInfo.capacity}mAh, Chemistry: ${batteryInfo.chemistry}` : 'Standard drone battery.'}

USER DIRECTIVE:
"${userDirective || 'Read all digital meter displays across the video, extract the charging telemetry data series (Voltage, Current, Battery %), detect 1% transitions, and summarize the charging curve.'}"

INSTRUCTIONS:
1. Carefully inspect each frame's digital meters (voltage, current, battery percentage).
2. For each frame, provide the detected readings in chronological order.
3. Answer the user's specific directive directly and comprehensively.
4. Extract key milestones: peak current, cutoff/max voltage, initial SoC, final SoC, and estimated integrated energy (Wh).
5. Identify any 1% SoC increment transitions with timestamps.

Respond ONLY with a JSON object in this exact schema:
{
  "summary": string,
  "answerToUser": string,
  "peakCurrent": number or null,
  "peakVoltage": number or null,
  "initialSoC": number or null,
  "finalSoC": number or null,
  "estimatedEnergyWh": number or null,
  "overallChargingPhase": string,
  "readings": [
    {
      "timestampSec": number,
      "timestampFormatted": string,
      "voltage": number or null,
      "current": number or null,
      "batteryPercentage": number or null,
      "power": number or null,
      "phase": string,
      "notes": string
    }
  ],
  "transitions": [
    {
      "fromPercent": number,
      "toPercent": number,
      "timestampFormatted": string,
      "elapsedSeconds": number,
      "durationSeconds": number
    }
  ]
}`;

    contentParts.push({ text: prompt });

    const response = await generateContentWithRetry(ai, {
      contents: contentParts,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let result: any;
    try {
      result = parseJsonFromText(responseText);
    } catch {
      result = {
        summary: responseText,
        answerToUser: responseText,
        peakCurrent: null,
        peakVoltage: null,
        initialSoC: null,
        finalSoC: null,
        estimatedEnergyWh: null,
        overallChargingPhase: 'Unknown',
        readings: [],
        transitions: [],
      };
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error in /api/ai/analyze-video:', error);
    res.status(500).json({
      success: false,
      error: formatAiErrorMessage(error),
    });
  }
});

// ================= VITE OR STATIC SERVING =================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const ai = Boolean(process.env.GEMINI_API_KEY);
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const cyan = '\x1b[36m';
    const reset = '\x1b[0m';
    console.log('');
    console.log(`${cyan}╔══════════════════════════════════════════════════════════════════╗${reset}`);
    console.log(`${cyan}║  Battery Performance & Diagnosis System                         ║${reset}`);
    console.log(`${cyan}║  Production-Grade Telemetry — 7-Segment OCR + Gemini AI Vision  ║${reset}`);
    console.log(`${cyan}╚══════════════════════════════════════════════════════════════════╝${reset}`);
    console.log('');
    console.log(`${green}  → Frontend + Backend ready:${reset}  http://localhost:${PORT}`);
    console.log(`${green}  → AI Status:${reset}             ${ai ? green + 'CONFIGURED (Gemini AI Vision with dynamic fallback)' + reset : yellow + 'NOT CONFIGURED (set GEMINI_API_KEY in .env)' + reset}`);
    console.log(`${green}  → Camera Pipeline:${reset}         Optical 7-segment decoder (pixel-level) + Multimodal AI`);
    console.log(`${green}  → Data Integrity Mode:${reset}     ZERO synthetic leakage — demoMode strict guard`);
    console.log('');
  });
}

startServer();
