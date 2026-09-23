import { AppSettings, ChargingSession, BatteryProfile } from '../types/battery';
import { generateSessionDiagnosis, calculateReadingMetrics, calculateOnePercentTransitions } from '../calculations/batteryCalculations';

const SETTINGS_STORAGE_KEY = 'bcpds_settings';
const SESSIONS_STORAGE_KEY = 'bcpds_sessions';
const BATTERIES_STORAGE_KEY = 'bcpds_batteries';

export const DEFAULT_SETTINGS: AppSettings = {
  selectedCameraId: '',
  cameraResolution: '1280x720',
  samplingIntervalMs: 2000,
  stalenessWindowMs: 5000,
  demoMode: false,
  manualReadingEnabled: false,
  voltageUnit: 'V',
  currentUnit: 'A',
  energyUnit: 'Wh',
  ocrMinConfidenceThreshold: 75,
  calibratedBoxes: {
    voltage: {
      x: 0.12,
      y: 0.22,
      width: 0.35,
      height: 0.45,
      label: 'Voltage Meter',
      confidence: 96,
    },
    current: {
      x: 0.54,
      y: 0.18,
      width: 0.38,
      height: 0.28,
      label: 'Current Meter',
      confidence: 94,
    },
    batteryPercent: {
      x: 0.54,
      y: 0.52,
      width: 0.38,
      height: 0.25,
      label: 'Battery % Display',
      confidence: 93,
    },
  },
};

export const DEFAULT_BATTERIES: BatteryProfile[] = [
  {
    batteryId: 'BAT-4S-5000',
    batteryName: 'Tattu R-Line 4S 5000mAh 120C',
    batteryChemistry: 'LiPo (Lithium Polymer)',
    ratedVoltage: 14.8,
    maxVoltage: 16.8,
    capacity: 5000,
    numberOfCells: 4,
    manufacturer: 'Gens Ace / Tattu',
    notes: 'Heavy-lift surveillance drone main power pack.',
  },
  {
    batteryId: 'BAT-6S-6000',
    batteryName: 'Gens Ace 6S 6000mAh 60C',
    batteryChemistry: 'LiPo (Lithium Polymer)',
    ratedVoltage: 22.2,
    maxVoltage: 25.2,
    capacity: 6000,
    numberOfCells: 6,
    manufacturer: 'Gens Ace',
    notes: 'Commercial mapping quadcopter battery.',
  },
  {
    batteryId: 'BAT-3S-2200',
    batteryName: 'Lumenier 3S 2200mAh 35C',
    batteryChemistry: 'Li-Ion',
    ratedVoltage: 11.1,
    maxVoltage: 12.6,
    capacity: 2200,
    numberOfCells: 3,
    manufacturer: 'Lumenier',
    notes: 'Training drone lightweight battery.',
  },
];

/**
 * Creates a realistic historical demo session with full CC/CV curve
 */
export function createSeedDemoSession(): ChargingSession {
  const sessionId = 'SES-DEMO-2026-001';
  const batteryId = 'BAT-4S-5000';
  const startMs = Date.now() - 3600 * 1000 * 1.5; // 1.5 hours ago
  const readings = [];

  let currentV = 14.90; // Starting voltage (~22% SoC for 4S LiPo)
  let currentI = 4.85; // 1C charge rate ~5A
  let currentPct = 22;
  let prevReading;

  // Simulate 35 sample points over ~45 minutes
  const totalSamples = 36;
  const intervalSeconds = 75; // 1 min 15 sec per sample

  for (let step = 0; step < totalSamples; step++) {
    const timestampMs = startMs + step * intervalSeconds * 1000;
    
    // Physical CC/CV simulation curve
    if (currentPct < 85) {
      // CC Phase: Current steady around 4.8 - 4.95A, Voltage steadily climbs to 16.8V
      currentV += 0.055;
      currentI = 4.85 + (Math.sin(step) * 0.04);
      currentPct = Math.min(85, 22 + Math.floor(step * 1.8));
    } else {
      // CV Phase: Voltage caps at ~16.80V, Current tapers down to 0.45A
      currentV = 16.80 + (Math.sin(step * 2) * 0.01);
      currentI = Math.max(0.40, currentI * 0.88);
      currentPct = Math.min(100, currentPct + 1);
    }

    const ocrConf = 92 + Math.floor(Math.random() * 7);
    const reading = calculateReadingMetrics(
      timestampMs,
      startMs,
      currentV,
      currentI,
      currentPct,
      prevReading,
      ocrConf,
      'OCR',
      'Verified'
    );
    reading.sessionId = sessionId;
    readings.push(reading);
    prevReading = reading;
  }

  const endMs = startMs + (totalSamples - 1) * intervalSeconds * 1000;
  const transitions = calculateOnePercentTransitions(readings);

  const session: ChargingSession = {
    sessionId,
    batteryId,
    batteryName: 'Tattu R-Line 4S 5000mAh 120C',
    batteryCapacity: 5000,
    batteryChemistry: 'LiPo (Lithium Polymer)',
    chargerName: 'ISDT Q6 Nano Smart Balance Charger',
    operatorName: 'Senior Flight Engineer',
    notes: 'Reference laboratory baseline charging test at 1C standard charge rate.',
    startTimestamp: new Date(startMs).toISOString(),
    endTimestamp: new Date(endMs).toISOString(),
    totalDurationSeconds: Math.round((endMs - startMs) / 1000),
    sessionStatus: 'completed',
    isDemo: true,
    readings,
    transitions,
  };

  session.diagnosis = generateSessionDiagnosis(session);
  return session;
}

export const storageService = {
  getSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load settings from storage', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  getBatteries(): BatteryProfile[] {
    try {
      const stored = localStorage.getItem(BATTERIES_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load batteries', e);
    }
    return DEFAULT_BATTERIES;
  },

  getSessions(): ChargingSession[] {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
    const settings = this.getSettings();
    if (settings.demoMode !== true) {
      return [];
    }
    const seed = createSeedDemoSession();
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([seed]));
    } catch (e) {
      console.error('Failed to save initial seed session', e);
    }
    return [seed];
  },

  getSessionById(sessionId: string): ChargingSession | undefined {
    const sessions = this.getSessions();
    return sessions.find((s) => s.sessionId === sessionId);
  },

  saveSession(session: ChargingSession): void {
    try {
      let sessions: ChargingSession[] = [];
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            sessions = parsed;
          }
        } catch {
          sessions = [];
        }
      } else {
        sessions = [];
      }

      const existingIdx = sessions.findIndex((s) => s.sessionId === session.sessionId);
      if (existingIdx >= 0) {
        sessions[existingIdx] = session;
      } else {
        sessions.unshift(session);
      }
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save session to storage', e);
    }
  },

  deleteSession(sessionId: string): void {
    try {
      let sessions: ChargingSession[] = [];
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            sessions = parsed;
          }
        } catch {
          sessions = [];
        }
      }
      sessions = sessions.filter((s) => s.sessionId !== sessionId);
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  },
};
