export type SessionStatus = 'idle' | 'recording' | 'paused' | 'completed';

export type ValidationStatus =
  | 'Verified'
  | 'Unverified'
  | 'Corrected'
  | 'Low Confidence'
  | 'Missing'
  | 'Demo Data';

export type ReadingSource = 'OCR' | 'Manual' | 'AI_Vision';

export interface AiDisplayDetectionResult {
  detected: boolean;
  voltage: number | null;
  current: number | null;
  batteryPercentage: number | null;
  power: number | null;
  chargingPhase: string;
  confidence: number;
  readoutText: string;
  metersFound: string[];
}

export interface AiVideoFrameReading {
  timestampSec: number;
  timestampFormatted: string;
  voltage: number | null;
  current: number | null;
  batteryPercentage: number | null;
  power: number | null;
  phase: string;
  notes: string;
}

export interface AiVideoTransition {
  fromPercent: number;
  toPercent: number;
  timestampFormatted: string;
  elapsedSeconds: number;
  durationSeconds: number;
}

export interface AiVideoAnalysisResult {
  summary: string;
  answerToUser: string;
  peakCurrent: number | null;
  peakVoltage: number | null;
  initialSoC: number | null;
  finalSoC: number | null;
  estimatedEnergyWh: number | null;
  overallChargingPhase: string;
  readings: AiVideoFrameReading[];
  transitions: AiVideoTransition[];
}

export type TransitionStatus =
  | 'Normal'
  | 'Missing Data'
  | 'Incomplete Transition'
  | 'Requires Review';

export type DiagnosisStatus =
  | 'Normal'
  | 'Stable'
  | 'Review Required'
  | 'Missing Data'
  | 'Possible Abnormality'
  | 'Insufficient Data';

export interface BatteryProfile {
  batteryId: string;
  batteryName: string;
  batteryChemistry: string; // e.g. LiPo (Lithium Polymer), Li-Ion, LiFePO4
  ratedVoltage: number; // e.g. 11.1V (3S), 14.8V (4S), 22.2V (6S)
  maxVoltage: number; // e.g. 12.6V, 16.8V, 25.2V
  capacity: number; // in mAh, e.g. 5000 mAh
  numberOfCells: number; // e.g. 3, 4, 6
  manufacturer: string;
  notes?: string;
}

export interface RawOcrValue {
  voltage: number;
  current: number;
  batteryPercentage: number;
}

export interface Reading {
  sampleId: string;
  sessionId: string;
  date: string; // YYYY-MM-DD
  exactTimestamp: string; // ISO-8601 string
  timestampMs: number;
  elapsedSeconds: number;
  elapsedMinutes: number;
  elapsedHours: number;
  voltage: number; // Volts (V)
  current: number; // Amperes (A)
  batteryPercentage: number; // % (0-100)
  power: number; // Watts (W) = Voltage * Current
  dt: number; // Delta time from previous reading in hours
  dtSeconds: number; // Delta time in seconds
  energy: number; // Interval energy in Wh = Voltage * Current * dt
  cumulativeEnergy: number; // Total energy accumulated so far in Wh
  ah: number; // Interval charge in Ah = Current * dt
  cumulativeAh: number; // Total charge accumulated in Ah
  mah: number; // Interval charge in mAh = ah * 1000
  cumulativeMah: number; // Total charge in mAh
  rawOcrValue: RawOcrValue;
  correctedValue?: RawOcrValue;
  ocrConfidence: number; // 0 - 100%
  source: ReadingSource;
  validationStatus: ValidationStatus;
  notes?: string;
}

export interface Transition {
  transitionId: string;
  startPercentage: number;
  endPercentage: number;
  startTimestamp: string;
  endTimestamp: string;
  startElapsedSeconds: number;
  endElapsedSeconds: number;
  duration: number; // in seconds
  averageVoltage: number;
  averageCurrent: number;
  averagePower: number;
  energy: number; // Wh used during this 1% step
  mah: number; // mAh supplied during this 1% step
  minimumVoltage: number;
  maximumVoltage: number;
  minimumCurrent: number;
  maximumCurrent: number;
  sampleCount: number;
  confidence: number; // average OCR confidence
  status: TransitionStatus;
  notes?: string;
}

export interface ChargingSession {
  sessionId: string;
  batteryId: string;
  batteryName: string;
  batteryCapacity: number; // mAh
  batteryChemistry: string;
  chargerName: string;
  operatorName: string;
  notes?: string;
  startTimestamp: string;
  endTimestamp?: string;
  totalDurationSeconds: number;
  sessionStatus: SessionStatus;
  isDemo: boolean;
  readings: Reading[];
  transitions: Transition[];
  diagnosis?: DiagnosisReport;
}

export interface AbnormalityIssue {
  issueId: string;
  timestamp: string;
  issueType: string;
  measurement: string;
  expectedRule: string;
  observedValue: string;
  severity: 'Info' | 'Warning' | 'Critical';
  confidence: number;
  status: 'Open' | 'Reviewed' | 'Resolved';
  recommendedReviewAction: string;
}

export interface DiagnosisReport {
  reportId: string;
  sessionId: string;
  batteryId: string;
  batteryName: string;
  batteryChemistry: string;
  batteryCapacity: number;
  charger: string;
  operator: string;
  startTimestamp: string;
  endTimestamp: string;
  totalDurationSeconds: number;
  isDemo: boolean;

  // Charging summary
  startingPercentage: number;
  endingPercentage: number;
  totalPercentageIncrease: number;
  startingVoltage: number;
  endingVoltage: number;
  minimumVoltage: number;
  maximumVoltage: number;
  averageVoltage: number;
  startingCurrent: number;
  endingCurrent: number;
  minimumCurrent: number;
  maximumCurrent: number;
  averageCurrent: number;
  averagePower: number;
  maximumPower: number;
  totalEnergyWh: number;
  totalAh: number;
  totalMah: number;
  totalSamples: number;
  averageOcrConfidence: number;
  dataQualityScore: number; // 0 - 100%

  // Behavior
  voltageBehavior: string;
  currentBehavior: string;
  powerBehavior: string;
  chargingSpeed: string;
  slowChargingRanges: string;
  fastChargingRanges: string;
  percentageTransitionConsistency: string;
  chargingStability: DiagnosisStatus;

  // Warnings & Abnormalities
  warnings: string[];
  abnormalities: AbnormalityIssue[];
  mainFindings: string[];
  calculationNotes: string[];
}

export interface MeterBoundingBox {
  x: number; // 0 to 1 relative
  y: number; // 0 to 1 relative
  width: number; // 0 to 1 relative
  height: number; // 0 to 1 relative
  label: 'Voltage Meter' | 'Current Meter' | 'Battery % Display';
  confidence: number;
}

export interface MeterDetectionResult {
  voltageMeterBox?: MeterBoundingBox;
  currentMeterBox?: MeterBoundingBox;
  batteryPercentBox?: MeterBoundingBox;
  allMetersDetected: boolean;
  overallConfidence: number;
  statusMessage: string;
}

export interface AppSettings {
  selectedCameraId: string;
  cameraResolution: '640x480' | '1280x720' | '1920x1080';
  samplingIntervalMs: number; // e.g. 2000 ms
  stalenessWindowMs: number; // e.g. 5000 ms — max age for a reading before it is considered stale for recording
  demoMode: boolean;
  manualReadingEnabled: boolean;
  voltageUnit: 'V' | 'mV';
  currentUnit: 'A' | 'mA';
  energyUnit: 'Wh' | 'J';
  ocrMinConfidenceThreshold: number; // e.g. 70%
  calibratedBoxes?: {
    voltage: MeterBoundingBox;
    current: MeterBoundingBox;
    batteryPercent: MeterBoundingBox;
  };
}
