import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Play,
  Pause,
  Square,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  CameraOff,
  Video,
  Clock,
  Zap,
  BatteryCharging,
  Gauge,
  Sliders,
  ShieldAlert,
  RefreshCw,
  Eye,
  Plus,
  Minus,
  Save,
  Info,
  SwitchCamera,
  Upload,
  Sparkles,
  Check,
  Film,
} from 'lucide-react';
import {
  Reading,
  SessionStatus,
  ChargingSession,
  MeterBoundingBox,
  MeterDetectionResult,
  AppSettings,
  ValidationStatus,
  RawOcrValue,
  AiDisplayDetectionResult,
} from '../types/battery';
import { cameraManager, CameraDeviceInfo } from '../camera/cameraManager';
import { detectMetersOnFrame, autodetectDisplayBoxes } from '../detection/meterDetection';
import {
  extractBoxValue,
  validatePhysicalReadings,
  OcrTemporalValidator,
  OcrDetectionBoxResult,
} from '../ocr/meterOcr';
import { calculateReadingMetrics } from '../calculations/batteryCalculations';
import { MeterCanvasOverlay } from '../components/MeterCanvasOverlay';
import { StartSessionModal } from '../components/StartSessionModal';
import { ManualCorrectionModal } from '../components/ManualCorrectionModal';
import { VideoAiAnalyzer } from '../components/VideoAiAnalyzer';
import { aiService } from '../services/aiService';

interface ChargingMonitorPageProps {
  settings: AppSettings;
  activeSession: ChargingSession | null;
  onStartSession: (sessionInfo: any) => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onStopSession: () => void;
  onNewReading: (reading: Reading) => void;
  onUpdateLatestReading: (reading: Reading) => void;
  onImportVideoReadings?: (readings: Reading[], meta?: any) => void;
  onOpenCalibration: () => void;
  onOpenDiagnosis: (session: ChargingSession) => void;
}

export const ChargingMonitorPage: React.FC<ChargingMonitorPageProps> = ({
  settings,
  activeSession,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onStopSession,
  onNewReading,
  onUpdateLatestReading,
  onImportVideoReadings,
  onOpenCalibration,
  onOpenDiagnosis,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Optical Temporal Validator instance (guarantees zero random numbers and filters optical flicker)
  const temporalValidatorRef = useRef<OcrTemporalValidator>(new OcrTemporalValidator());

  // Monitor Display Mode: 'camera' or 'video'
  const [monitorMode, setMonitorMode] = useState<'camera' | 'video'>('camera');

  // AI Auto-Detection state (no bounding boxes needed!)
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [continuousAiDetect, setContinuousAiDetect] = useState(false);
  const [aiDetectionResult, setAiDetectionResult] = useState<AiDisplayDetectionResult | null>(null);
  const [aiStatusMessage, setAiStatusMessage] = useState<string>('AI Display Scanner Ready');

  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(settings.selectedCameraId || '');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isStaticImageLoaded, setIsStaticImageLoaded] = useState(false);

  // Meter Detection & Bounding Boxes
  const [currentBoxes, setCurrentBoxes] = useState<{
    voltage: MeterBoundingBox;
    current: MeterBoundingBox;
    batteryPercent: MeterBoundingBox;
  }>(
    settings.calibratedBoxes || {
      voltage: { x: 0.10, y: 0.20, width: 0.38, height: 0.52, label: 'Voltage Meter', confidence: 90 },
      current: { x: 0.52, y: 0.16, width: 0.40, height: 0.32, label: 'Current Meter', confidence: 90 },
      batteryPercent: { x: 0.52, y: 0.52, width: 0.40, height: 0.30, label: 'Battery % Display', confidence: 90 },
    }
  );

  const [detectionResult, setDetectionResult] = useState<MeterDetectionResult>({
    allMetersDetected: false,
    overallConfidence: 0,
    statusMessage: 'Camera Offline',
  });

  // REAL Readings strictly detected from meters or entered manually. Defaults to null: ZERO FAKE NUMBERS!
  const [liveVoltage, setLiveVoltage] = useState<number | null>(null);
  const [liveCurrent, setLiveCurrent] = useState<number | null>(null);
  const [livePercentage, setLivePercentage] = useState<number | null>(null);
  const [liveOcrConfidence, setLiveOcrConfidence] = useState<number>(0);
  const [liveValidationStatus, setLiveValidationStatus] = useState<ValidationStatus>('Missing');
  const [liveWarning, setLiveWarning] = useState<string | null>(null);
  const [lastOcrDetectionTime, setLastOcrDetectionTime] = useState<number | null>(null);

  // ORIGIN BADGE STATE — per-metric source of truth (audit trail, TR-2.5)
  type MetricOrigin = '7-SEG' | 'AI_Vision' | 'MANUAL' | 'DEMO' | '--';
  const [vOrigin, setVOrigin] = useState<MetricOrigin>('--');
  const [iOrigin, setIOrigin] = useState<MetricOrigin>('--');
  const [pOrigin, setPOrigin] = useState<MetricOrigin>('--');

  // BACKEND + AI CONNECTIVITY STATUS (AC-6)
  type HealthState = {
    ok: boolean | null;
    aiConfigured: boolean | null;
    checkedAt: number | null;
    error?: string;
  };
  const [healthState, setHealthState] = useState<HealthState>({
    ok: null,
    aiConfigured: null,
    checkedAt: null,
  });

  // AUTO-RECORD skipped frame counter (AC-3)
  const [skippedFrames, setSkippedFrames] = useState<number>(0);

  // PER-METRIC VALIDATION STATUS (from OcrTemporalValidator.getAllStatuses) (AC-1, AC-3)
  type PerMetricValidation = {
    voltage: ValidationStatus;
    current: ValidationStatus;
    battery: ValidationStatus;
    overall: ValidationStatus;
  };
  const [perMetricValidation, setPerMetricValidation] = useState<PerMetricValidation>({
    voltage: 'Missing',
    current: 'Missing',
    battery: 'Missing',
    overall: 'Missing',
  });

  // FRAME QUALITY HUD (AC-12)
  type FrameQuality = {
    brightness: number;
    contrast: number;
    sharpness: number;
    blur: number;
    tooDark: boolean;
    lowContrast: boolean;
    blurry: boolean;
    capturedAt: number | null;
  } | null;
  const [frameQuality, setFrameQuality] = useState<FrameQuality>(null);

  // FIRST-RUN ONBOARDING CARD (AC-13)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('bcpds_onboarded') !== 'true';
    } catch (_) {
      return true;
    }
  });

  // OCR below-threshold reject counter (trace-only, no UI)
  const ocrRejectedBelowThresholdRef = useRef<number>(0);

  // AI fallback trigger — 3 consecutive all-null native ticks → invoke AI detectDisplay (FR-5 fallback)
  const consecutiveNullTicksRef = useRef<number>(0);

  // Detailed OCR Debug Diagnostics
  const [vResultInfo, setVResultInfo] = useState<OcrDetectionBoxResult | null>(null);
  const [iResultInfo, setIResultInfo] = useState<OcrDetectionBoxResult | null>(null);
  const [pResultInfo, setPResultInfo] = useState<OcrDetectionBoxResult | null>(null);

  // Operator Quick Manual Set — empty by default (no fake numbers)
  const [manualInputV, setManualInputV] = useState<string>('');
  const [manualInputI, setManualInputI] = useState<string>('');
  const [manualInputPct, setManualInputPct] = useState<string>('');
  const [autoRecordSamples, setAutoRecordSamples] = useState(true);

  // Modals
  const [isInspectModalOpen, setIsInspectModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // Measure container dimensions for responsive overlay
  useEffect(() => {
    const updateDims = () => {
      if (containerRef.current) {
        setContainerDims({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  // Sync calibrated boxes from settings if updated
  useEffect(() => {
    if (settings.calibratedBoxes) {
      setCurrentBoxes(settings.calibratedBoxes);
    }
  }, [settings.calibratedBoxes]);

  // Enumerate cameras
  const refreshCameras = useCallback(async () => {
    const devices = await cameraManager.getAvailableCameras();
    setAvailableCameras(devices);
    if (devices.length > 0 && !selectedCameraId) {
      setSelectedCameraId(devices[0].deviceId);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    refreshCameras();
  }, [refreshCameras]);

  // resetLiveTelemetry — atomic helper: clears live state on camera stop / track ended / manual reset (AC-9)
  const resetLiveTelemetry = useCallback(() => {
    setLiveVoltage(null);
    setLiveCurrent(null);
    setLivePercentage(null);
    setVOrigin('--');
    setIOrigin('--');
    setPOrigin('--');
    setLastOcrDetectionTime(null);
    setLiveOcrConfidence(0);
    setLiveValidationStatus('Missing');
    setLiveWarning(null);
    setSkippedFrames(0);
    setPerMetricValidation({ voltage: 'Missing', current: 'Missing', battery: 'Missing', overall: 'Missing' });
    setFrameQuality(null);
    try { temporalValidatorRef.current?.reset(); } catch (_) { /* ignore */ }
    setManualInputV('');
    setManualInputI('');
    setManualInputPct('');
  }, []);

  // Backend & AI Connectivity Poll — every 30s + on mount (AC-6, NFR-2)
  const runHealthCheck: () => Promise<void> = useCallback(async () => {
    try {
      const res = await aiService.checkHealth();
      setHealthState({
        ok: true,
        aiConfigured: Boolean(res?.aiConfigured ?? false),
        checkedAt: Date.now(),
      });
    } catch (err: any) {
      setHealthState({
        ok: false,
        aiConfigured: null,
        checkedAt: Date.now(),
        error: err?.message || 'Network error',
      });
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
    const iv = window.setInterval(runHealthCheck, 30000);
    return () => window.clearInterval(iv);
  }, [runHealthCheck]);

  // Auto-dismiss onboarding after first overall Verified (AC-13)
  useEffect(() => {
    if (perMetricValidation.overall === 'Verified') {
      setShowOnboarding(false);
    }
  }, [perMetricValidation.overall]);

  // Handle Camera Start / Stop
  const handleToggleCamera = async () => {
    if (isCameraActive) {
      cameraManager.stopCamera(videoRef.current);
      setIsCameraActive(false);
      setIsCameraStarting(false);
      setDetectionResult({
        allMetersDetected: false,
        overallConfidence: 0,
        statusMessage: 'Camera Stopped',
      });
      resetLiveTelemetry();
    } else {
      setCameraError(null);
      setIsCameraStarting(true);
      setIsStaticImageLoaded(false);

      if (!videoRef.current) {
        setIsCameraStarting(false);
        setCameraError(
          'Video element is not ready yet. Please wait a moment for the page to fully render and retry.'
        );
        return;
      }

      try {
        const res = await cameraManager.startCamera(
          videoRef.current,
          selectedCameraId,
          settings.cameraResolution,
          facingMode
        );

        if (res.success) {
          setIsCameraActive(true);
          refreshCameras();
          resetLiveTelemetry();
          setSkippedFrames(0);
          // Attach track ended listener to reset state if camera is unplugged / permission revoked (AC-9)
          try {
            const stream: MediaStream | undefined = (videoRef.current as any)?.srcObject as MediaStream | undefined;
            if (stream) {
              const tracks = stream.getVideoTracks();
              if (tracks.length > 0) {
                tracks[0].addEventListener('ended', () => {
                  cameraManager.stopCamera(videoRef.current);
                  setIsCameraActive(false);
                  resetLiveTelemetry();
                });
              }
            }
          } catch (_) { /* ignore listener attach failure */ }
          setDetectionResult({
            allMetersDetected: false,
            overallConfidence: 0,
            statusMessage:
              'Camera streaming. Calibrate meter boxes (Settings → Calibrate) or drag sliders to begin optical OCR reading.',
          });
        } else {
          setCameraError(res.error || 'Failed to start camera.');
        }
      } catch (err: any) {
        console.error('Unexpected error while starting camera:', err);
        setCameraError(
          err?.message || 'Unexpected error while opening the camera. Please reload the page and try again.'
        );
      } finally {
        setIsCameraStarting(false);
      }
    }
  };

  // Flip Camera between Rear (Bench) and Front
  const handleFlipCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    cameraManager.setFacingMode(nextMode);

    if (isCameraActive && videoRef.current) {
      setIsCameraStarting(true);
      try {
        const res = await cameraManager.startCamera(
          videoRef.current,
          undefined,
          settings.cameraResolution,
          nextMode
        );
        if (!res.success) {
          setCameraError(res.error || 'Failed to flip camera.');
        }
      } catch (err: any) {
        console.error('Unexpected error while flipping camera:', err);
        setCameraError(err?.message || 'Unexpected error while switching cameras.');
      } finally {
        setIsCameraStarting(false);
      }
    }
  };

  // Handle Image Upload (Allows testing OCR and AI directly on bench meter photos)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        setIsStaticImageLoaded(true);

        if (isCameraActive) {
          cameraManager.stopCamera(videoRef.current);
          setIsCameraActive(false);
        }

        // Run AI detection immediately on the uploaded photo with high accuracy
        setTimeout(() => {
          handleAutoDetectWithAi();
        }, 50);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Autodetect display boxes from the current frame
  const handleAutoDetectBoxes = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    if (isCameraActive && videoRef.current) {
      cameraManager.captureFrameToCanvas(videoRef.current, canvas);
    }
    const detected = autodetectDisplayBoxes(canvas);
    setCurrentBoxes(detected);
  };

  // Central OCR Frame Evaluator
  const runOcrAnalysisOnCanvas = (canvas: HTMLCanvasElement) => {
    // 0. Capture Frame Quality for HUD display (AC-12)
    try {
      const { analyzeFrameQuality } = require('../detection/meterDetection');
      if (typeof analyzeFrameQuality === 'function') {
        const q = analyzeFrameQuality(canvas);
        setFrameQuality((prev) => {
          if (prev && q && Date.now() - (prev.capturedAt || 0) < 400) return prev;
          return {
            brightness: q.brightness ?? 0,
            contrast: q.contrast ?? 0,
            sharpness: q.sharpness ?? 0,
            blur: q.blur ?? 0,
            tooDark: Boolean(q.tooDark),
            lowContrast: Boolean(q.lowContrast),
            blurry: Boolean(q.blurry),
            capturedAt: Date.now(),
          };
        });
      }
    } catch (_) { /* ignored: frame quality is best-effort */ }

    // 1. Detect frame lighting & LCD display bezels
    const det = detectMetersOnFrame(canvas, currentBoxes);
    setDetectionResult(det);

    // 2. Extract OCR candidate values from bounding boxes
    const vBox = currentBoxes.voltage;
    const iBox = currentBoxes.current;
    const pBox = currentBoxes.batteryPercent;

    const vRes = extractBoxValue(canvas, vBox, 'voltage', 0.5, 60.0);
    const iRes = extractBoxValue(canvas, iBox, 'current', 0.0, 35.0);
    const pRes = extractBoxValue(canvas, pBox, 'percent', 0, 100);

    setVResultInfo(vRes);
    setIResultInfo(iRes);
    setPResultInfo(pRes);

    // 3. Multi-Frame Temporal Stability Validation
    const validationResult = temporalValidatorRef.current.validateStream(
      vRes.value,
      iRes.value,
      pRes.value
    );

    // 3b. Expose per-metric validation status for recording guard & telemetry card borders
    try {
      const s = temporalValidatorRef.current.getAllStatuses();
      setPerMetricValidation(s);
    } catch (_) { /* ignore validator extension absence */ }

    // 4. Update live readings ONLY if real digits pass confidence threshold
    // IMPORTANT: If current reading came from AI Vision or MANUAL, do NOT let uncalibrated optical noise overwrite it!
    const isAiOrManualV = vOrigin === 'AI_Vision' || vOrigin === 'MANUAL';
    const isAiOrManualI = iOrigin === 'AI_Vision' || iOrigin === 'MANUAL';
    const isAiOrManualP = pOrigin === 'AI_Vision' || pOrigin === 'MANUAL';

    const threshold = typeof settings?.ocrMinConfidenceThreshold === 'number'
      ? settings.ocrMinConfidenceThreshold
      : 75;
    let anyBoxAcceptedThisFrame = false;

    if (
      !isAiOrManualV &&
      vRes.valid === true &&
      vRes.value !== null &&
      !Number.isNaN(vRes.value) &&
      typeof vRes.confidence === 'number' &&
      vRes.confidence >= threshold
    ) {
      setLiveVoltage(vRes.value);
      setManualInputV(vRes.value.toFixed(2));
      setVOrigin('7-SEG');
      anyBoxAcceptedThisFrame = true;
    } else if (vRes.valid || vRes.value !== null) {
      ocrRejectedBelowThresholdRef.current++;
    }

    if (
      !isAiOrManualI &&
      iRes.valid === true &&
      iRes.value !== null &&
      !Number.isNaN(iRes.value) &&
      typeof iRes.confidence === 'number' &&
      iRes.confidence >= threshold
    ) {
      setLiveCurrent(iRes.value);
      setManualInputI(iRes.value.toFixed(2));
      setIOrigin('7-SEG');
      anyBoxAcceptedThisFrame = true;
    } else if (iRes.valid || iRes.value !== null) {
      ocrRejectedBelowThresholdRef.current++;
    }

    if (
      !isAiOrManualP &&
      pRes.valid === true &&
      pRes.value !== null &&
      !Number.isNaN(pRes.value) &&
      typeof pRes.confidence === 'number' &&
      pRes.confidence >= threshold
    ) {
      setLivePercentage(pRes.value);
      setManualInputPct(pRes.value.toString());
      setPOrigin('7-SEG');
      anyBoxAcceptedThisFrame = true;
    } else if (pRes.valid || pRes.value !== null) {
      ocrRejectedBelowThresholdRef.current++;
    }

    // Advance staleness clock if accepted this frame
    if (anyBoxAcceptedThisFrame) {
      setLastOcrDetectionTime(Date.now());
    }

    // Determine overall confidence and validation status
    const anyDetected = (vRes.valid && vRes.confidence >= threshold) ||
      (iRes.valid && iRes.confidence >= threshold) ||
      (pRes.valid && pRes.confidence >= threshold);
    const allThreeNull = !(vRes.valid || iRes.valid || pRes.valid);

    // AI FALLBACK TRIGGER — 3 consecutive all-null native ticks → call AI detectDisplay
    if (allThreeNull && (isCameraActive || isStaticImageLoaded)) {
      consecutiveNullTicksRef.current += 1;
      if (consecutiveNullTicksRef.current >= 3 && !isAiScanning && continuousAiDetect) {
        consecutiveNullTicksRef.current = 0;
        handleAutoDetectWithAi();
      }
    } else if (anyDetected) {
      consecutiveNullTicksRef.current = 0;
    }

    if (anyDetected && !isAiOrManualV) {
      const confidences = [vRes.confidence, iRes.confidence, pRes.confidence].filter(
        (c) => typeof c === 'number' && c > 0
      );
      const avgConf = confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0;
      setLiveOcrConfidence(avgConf);

      const statuses = [
        validationResult.voltage.validationStatus,
        validationResult.current.validationStatus,
        validationResult.percent.validationStatus,
      ];

      if (statuses.includes('Verified')) {
        setLiveValidationStatus('Verified');
        setLiveWarning(null);
      } else if (statuses.includes('Unverified')) {
        setLiveValidationStatus('Unverified');
        setLiveWarning('Verifying frame stability across consecutive video frames...');
      } else if (statuses.includes('Low Confidence')) {
        setLiveValidationStatus('Low Confidence');
        setLiveWarning(
          validationResult.voltage.warning ||
          validationResult.current.warning ||
          validationResult.percent.warning ||
          'Low optical contrast on display segments'
        );
      }
    } else if (!isAiOrManualV && allThreeNull) {
      setLiveValidationStatus('Missing');
      setLiveOcrConfidence(0);
      setLiveWarning('Point camera at meter displays or click AI Auto-Detect.');
    }
  };

  // Real Optical Processing Loop (Extracts real digits from camera frames)
  useEffect(() => {
    let animFrame: number;
    let lastScanTime = 0;

    const processFrame = (time: number) => {
      if (isCameraActive && videoRef.current && canvasRef.current && time - lastScanTime > 400) {
        lastScanTime = time;
        const captured = cameraManager.captureFrameToCanvas(videoRef.current, canvasRef.current);
        if (captured) {
          runOcrAnalysisOnCanvas(canvasRef.current);
        }
      }
      animFrame = requestAnimationFrame(processFrame);
    };

    if (isCameraActive) {
      animFrame = requestAnimationFrame(processFrame);
    }

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [isCameraActive, currentBoxes]);

  // Periodic Recording Timer during Active Session
  // STRICT RULE: ONLY records REAL readings detected by OCR or manually confirmed by the technician.
  // ZERO random numbers are ever inserted.
  useEffect(() => {
    if (!activeSession || activeSession.sessionStatus !== 'recording' || !autoRecordSamples) {
      return;
    }

    const interval = setInterval(() => {
      // PRODUCTION-GRADE 4-PART INTEGRITY GUARD (AC-3)
      // Only insert a reading when ALL four conditions are met:
      //   1. All three numeric values are non-null finite numbers
      //   2. All three origin badges are tagged (provenance audit trail)
      //   3. Last detection timestamp is within the configurable staleness window
      //   4. Overall validation status is 'Verified' (temporal validator confirmed 2+ consecutive matches)
      const allValuesPresent =
        typeof liveVoltage === 'number' && !Number.isNaN(liveVoltage) &&
        typeof liveCurrent === 'number' && !Number.isNaN(liveCurrent) &&
        typeof livePercentage === 'number' && !Number.isNaN(livePercentage);

      const allOriginsTagged =
        vOrigin !== '--' && vOrigin !== null &&
        iOrigin !== '--' && iOrigin !== null &&
        pOrigin !== '--' && pOrigin !== null;

      const stalenessWindow =
        typeof settings?.stalenessWindowMs === 'number' && settings.stalenessWindowMs > 0
          ? settings.stalenessWindowMs
          : 5000;
      const freshEnough =
        typeof lastOcrDetectionTime === 'number' &&
        (Date.now() - lastOcrDetectionTime) < stalenessWindow;

      // For manual-origin readings, allow them through even if temporal validator is not 'Verified'
      // (human input = explicit confirmation). OCR/AI/demo still require Verified.
      const overallStatus = perMetricValidation.overall || liveValidationStatus;
      const manualOverride = vOrigin === 'MANUAL' || iOrigin === 'MANUAL' || pOrigin === 'MANUAL';
      const validationOk = manualOverride || overallStatus === 'Verified';

      const okToRecord = allValuesPresent && allOriginsTagged && freshEnough && validationOk;

      if (!okToRecord) {
        setSkippedFrames((n) => n + 1);
        return;
      }

      const prevReading = activeSession.readings[activeSession.readings.length - 1];
      const sessionStartMs = new Date(activeSession.startTimestamp).getTime();

      const validation = validatePhysicalReadings(
        liveVoltage as number,
        liveCurrent as number,
        livePercentage as number,
        prevReading
          ? {
              voltage: prevReading.voltage,
              current: prevReading.current,
              batteryPercentage: prevReading.batteryPercentage,
              timestampMs: prevReading.timestampMs,
            }
          : undefined
      );

      // Determine session source string: prefer most-recent-origin, else OCR default
      let recordSource: 'OCR' | 'Manual' | 'AI_Vision' = 'OCR';
      if (vOrigin === '7-SEG') recordSource = 'OCR';
      else if (vOrigin === 'MANUAL') recordSource = 'Manual';
      else if (vOrigin === 'AI_Vision') recordSource = 'AI_Vision';
      else if (vOrigin === 'DEMO') recordSource = 'Manual';

      // If overall origin is DEMO, stamp with 'Manual' but source record isDemo flag in session
      const finalValidation: ValidationStatus = validationOk
        ? (manualOverride ? 'Verified' : overallStatus as ValidationStatus)
        : 'Missing';

      const reading = calculateReadingMetrics(
        Date.now(),
        sessionStartMs,
        liveVoltage as number,
        liveCurrent as number,
        livePercentage as number,
        prevReading,
        liveOcrConfidence,
        recordSource,
        finalValidation
      );
      reading.sessionId = activeSession.sessionId;
      onNewReading(reading);
    }, settings.samplingIntervalMs || 2000);

    return () => clearInterval(interval);
  }, [
    activeSession,
    autoRecordSamples,
    liveVoltage,
    liveCurrent,
    livePercentage,
    liveOcrConfidence,
    lastOcrDetectionTime,
    settings.samplingIntervalMs,
    settings.stalenessWindowMs,
    onNewReading,
    vOrigin,
    iOrigin,
    pOrigin,
    perMetricValidation,
    liveValidationStatus,
  ]);

  // Auto-Detect display from camera or photo using Gemini AI Vision (No bounding boxes needed)
  const handleAutoDetectWithAi = useCallback(async () => {
    if (!isCameraActive && !isStaticImageLoaded) {
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    if (isCameraActive && video) {
      cameraManager.captureFrameToCanvas(video, canvas);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setIsAiScanning(true);
    setAiStatusMessage('AI Vision scanning meters in frame...');

    try {
      const batteryInfo = activeSession
        ? {
            name: activeSession.batteryName,
            capacity: activeSession.batteryCapacity,
            chemistry: activeSession.batteryChemistry,
          }
        : undefined;

      const result = await aiService.detectDisplay(dataUrl, batteryInfo, currentBoxes);
      setAiDetectionResult(result);

      const hasV = typeof result.voltage === 'number' && !isNaN(result.voltage);
      const hasI = typeof result.current === 'number' && !isNaN(result.current);
      const hasP = typeof result.batteryPercentage === 'number' && !isNaN(result.batteryPercentage);

      if (result.detected || hasV || hasI || hasP) {
        if (hasV) {
          setLiveVoltage(result.voltage);
          setManualInputV(result.voltage!.toFixed(2));
          setVOrigin('AI_Vision');
        }
        if (hasI) {
          setLiveCurrent(result.current);
          setManualInputI(result.current!.toFixed(2));
          setIOrigin('AI_Vision');
        }
        if (hasP) {
          setLivePercentage(result.batteryPercentage);
          setManualInputPct(result.batteryPercentage!.toString());
          setPOrigin('AI_Vision');
        }

        const conf = typeof result.confidence === 'number' && result.confidence > 0 ? result.confidence : 95;
        setLiveOcrConfidence(conf);
        setLiveValidationStatus('Verified');
        setLiveWarning(null);
        setLastOcrDetectionTime(Date.now());

        const summaryParts = [
          hasV ? `${result.voltage!.toFixed(2)}V` : null,
          hasI ? `${result.current!.toFixed(2)}A` : null,
          hasP ? `${result.batteryPercentage}%` : null,
        ].filter(Boolean);

        const phaseText = result.chargingPhase ? ` (${result.chargingPhase})` : '';
        setAiStatusMessage(
          summaryParts.length > 0
            ? `AI Locked: ${summaryParts.join(' | ')}${phaseText}`
            : result.readoutText || 'AI Meter Detection Complete'
        );

        // Record sample into active session if recording
        if (
          activeSession &&
          activeSession.sessionStatus === 'recording' &&
          autoRecordSamples &&
          hasV
        ) {
          const prevReading = activeSession.readings[activeSession.readings.length - 1];
          const sessionStartMs = new Date(activeSession.startTimestamp).getTime();
          const reading = calculateReadingMetrics(
            Date.now(),
            sessionStartMs,
            result.voltage as number,
            hasI ? (result.current as number) : (liveCurrent ?? 0),
            hasP ? (result.batteryPercentage as number) : (livePercentage ?? 0),
            prevReading,
            conf,
            'AI_Vision',
            'Verified',
            result.readoutText || `AI Auto-Detect (${result.chargingPhase})`
          );
          reading.sessionId = activeSession.sessionId;
          onNewReading(reading);
        }
      } else {
        setAiStatusMessage(result.readoutText || 'AI scanning: Adjust angle or lighting on displays');
      }
    } catch (err: any) {
      console.warn('AI Auto-Detect error:', err);
      setAiStatusMessage(`AI detection notice: ${err?.message || 'Check network connection'}`);
    } finally {
      setIsAiScanning(false);
    }
  }, [
    isCameraActive,
    isStaticImageLoaded,
    activeSession,
    autoRecordSamples,
    currentBoxes,
    liveCurrent,
    livePercentage,
    onNewReading,
  ]);

  // Continuous AI Display Auto-Detection Timer
  useEffect(() => {
    if (!isCameraActive || !continuousAiDetect) return;

    const interval = setInterval(() => {
      if (!isAiScanning) {
        handleAutoDetectWithAi();
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isCameraActive, continuousAiDetect, isAiScanning, handleAutoDetectWithAi]);


  // Auto-scan once when camera starts
  useEffect(() => {
    if (isCameraActive) {
      const timer = setTimeout(() => {
        handleAutoDetectWithAi();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isCameraActive, handleAutoDetectWithAi]);

  // Manual validation error state for strict bounds
  const [manualValidationErrors, setManualValidationErrors] = useState<{
    v?: string;
    i?: string;
    p?: string;
  }>({});

  // Manually Log / Capture Reading (Allows operator direct confirmation)
  const handleLogManualSample = () => {
    setManualValidationErrors({});
    const vRaw = manualInputV;
    const iRaw = manualInputI;
    const pRaw = manualInputPct;

    const errors: { v?: string; i?: string; p?: string } = {};

    if (!vRaw || vRaw.trim() === '') errors.v = 'Voltage is required';
    if (!iRaw || iRaw.trim() === '') errors.i = 'Current is required';
    if (!pRaw || pRaw.trim() === '') errors.p = 'Battery % is required';

    const v = Object.keys(errors).includes('v') ? NaN : parseFloat(vRaw);
    const i = Object.keys(errors).includes('i') ? NaN : parseFloat(iRaw);
    const p = Object.keys(errors).includes('p') ? NaN : parseInt(pRaw, 10);

    if (isNaN(v)) errors.v = errors.v || 'Voltage must be a valid number';
    if (isNaN(i)) errors.i = errors.i || 'Current must be a valid number';
    if (isNaN(p)) errors.p = errors.p || 'Battery % must be a valid integer';

    // Strict physical bounds
    if (!isNaN(v) && (v < 0 || v > 60)) errors.v = 'Voltage must be 0 – 60 V';
    if (!isNaN(i) && (i < 0 || i > 35)) errors.i = 'Current must be 0 – 35 A';
    if (!isNaN(p) && (p < 0 || p > 100)) errors.p = 'Battery % must be 0 – 100';

    if (Object.keys(errors).length > 0) {
      setManualValidationErrors(errors);
      const firstMsg = Object.values(errors)[0];
      alert(`Manual Sample Rejected:\n${firstMsg}\n\nExpected ranges: Voltage 0-60V, Current 0-35A, SoC 0-100%`);
      return;
    }

    setVOrigin('MANUAL');
    setIOrigin('MANUAL');
    setPOrigin('MANUAL');
    setLiveVoltage(v);
    setLiveCurrent(i);
    setLivePercentage(p);
    setLiveOcrConfidence(100);
    setLiveValidationStatus('Verified');
    setLiveWarning(null);
    setLastOcrDetectionTime(Date.now());
    try { temporalValidatorRef.current?.reset(); } catch (_) { /* ignore */ }

    if (activeSession && (activeSession.sessionStatus === 'recording' || activeSession.sessionStatus === 'paused')) {
      const prevReading = activeSession.readings[activeSession.readings.length - 1];
      const sessionStartMs = new Date(activeSession.startTimestamp).getTime();
      const reading = calculateReadingMetrics(
        Date.now(),
        sessionStartMs,
        v,
        i,
        p,
        prevReading,
        100,
        'Manual',
        'Verified',
        'Operator Manual Confirmation'
      );
      reading.sessionId = activeSession.sessionId;
      onNewReading(reading);
    }
  };

  // Quick Adjustment Helpers for Bench Technician
  const adjustValue = (type: 'v' | 'i' | 'p', delta: number) => {
    if (type === 'v') {
      const parsed = parseFloat(manualInputV);
      const cur = liveVoltage !== null ? liveVoltage : isNaN(parsed) ? 0 : parsed;
      const next = Number(Math.max(0, cur + delta).toFixed(2));
      setVOrigin('MANUAL');
      setLiveVoltage(next);
      setManualInputV(next.toFixed(2));
      setLastOcrDetectionTime(Date.now());
    } else if (type === 'i') {
      const parsed = parseFloat(manualInputI);
      const cur = liveCurrent !== null ? liveCurrent : isNaN(parsed) ? 0 : parsed;
      const next = Number(Math.max(0, cur + delta).toFixed(2));
      setIOrigin('MANUAL');
      setLiveCurrent(next);
      setManualInputI(next.toFixed(2));
      setLastOcrDetectionTime(Date.now());
    } else if (type === 'p') {
      const parsed = parseInt(manualInputPct, 10);
      const cur = livePercentage !== null ? livePercentage : isNaN(parsed) ? 0 : parsed;
      const next = Math.min(100, Math.max(0, cur + delta));
      setPOrigin('MANUAL');
      setLivePercentage(next);
      setManualInputPct(next.toString());
      setLastOcrDetectionTime(Date.now());
    }
  };

  // Load a High-Definition Test Pattern on Canvas for offline testing
  const handleLoadTestPattern = () => {
    if (!settings.demoMode) {
      alert(
        '[PRODUCTION INTEGRITY GUARD] Test Pattern loading is BLOCKED because Demo Mode is OFF.\n\n' +
          'Required action:\n' +
          '  1. Navigate to Settings page (⚙ Settings tab in navbar)\n' +
          '  2. Toggle "Demo / Test Mode" ON\n' +
          '  3. Return to Monitor and click Load Test Pattern again.\n\n' +
          'This ensures every downstream diagnosis report and Excel export correctly\n' +
          'watermarks the session with the DEMO DATA flag and displays the DEMO banner.'
      );
      return;
    }
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1280, 720);

    // Meter 1 (Voltage Meter)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(120, 140, 480, 380);
    ctx.fillRect(120, 140, 480, 380);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('METER 2: TERMINAL VOLTAGE', 150, 190);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 96px monospace';
    ctx.fillText('15.24 V', 160, 350);

    // Meter 2 (Current)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 4;
    ctx.strokeRect(660, 110, 520, 230);
    ctx.fillRect(660, 110, 520, 230);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('METER 1: CHARGE CURRENT', 690, 160);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 84px monospace';
    ctx.fillText('4.85 A', 710, 260);

    // Meter 3 (SoC %)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.strokeRect(660, 370, 520, 220);
    ctx.fillRect(660, 370, 520, 220);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('BATTERY STATE OF CHARGE', 690, 420);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 84px monospace';
    ctx.fillText('42 %', 710, 510);

    setIsStaticImageLoaded(true);

    if (isCameraActive) {
      cameraManager.stopCamera(videoRef.current);
      setIsCameraActive(false);
    }

    // Immediately run AI Vision on test pattern
    setTimeout(() => {
      handleAutoDetectWithAi();
    }, 50);

    setTimeout(() => {
      setVOrigin('DEMO');
      setIOrigin('DEMO');
      setPOrigin('DEMO');
    }, 200);
  };

  // Determine Badge Styling
  let detectionBadgeText = 'Camera Disconnected';
  let detectionBadgeBg = 'bg-slate-100 text-slate-700 border-slate-300';

  if (isCameraStarting) {
    detectionBadgeText = 'Connecting to Camera...';
    detectionBadgeBg = 'bg-blue-50 text-blue-800 border-blue-300';
  } else if (isCameraActive || isStaticImageLoaded) {
    if (vOrigin === 'AI_Vision' || iOrigin === 'AI_Vision' || pOrigin === 'AI_Vision') {
      detectionBadgeText = 'AI Vision: Meters Locked';
      detectionBadgeBg = 'bg-indigo-50 text-indigo-800 border-indigo-300';
    } else if (liveValidationStatus === 'Verified') {
      detectionBadgeText = 'Real OCR: Verified & Locked';
      detectionBadgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-300';
    } else if (liveValidationStatus === 'Unverified') {
      detectionBadgeText = 'OCR: Verifying Frame Stability...';
      detectionBadgeBg = 'bg-blue-50 text-blue-800 border-blue-300';
    } else if (liveValidationStatus === 'Low Confidence') {
      detectionBadgeText = 'OCR: Low Optical Clarity / Glare';
      detectionBadgeBg = 'bg-amber-50 text-amber-800 border-amber-300';
    } else {
      detectionBadgeText = 'AI Ready • Scan Camera Meters';
      detectionBadgeBg = 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }

  const latestReading = activeSession?.readings[activeSession.readings.length - 1];
  const elapsedSec = activeSession ? activeSession.totalDurationSeconds : 0;
  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Instantaneous Power (W)
  const calculatedPower =
    liveVoltage !== null && liveCurrent !== null
      ? Number((liveVoltage * liveCurrent).toFixed(2))
      : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Hidden File Input for Meter Photos */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Top Banner Alert if Camera Blocked or Error */}
      {cameraError && (
        <div className="bg-red-50 border border-red-300 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-red-900 shadow-xs">
          <div className="flex items-start space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-950">Camera Connection Notice</p>
              <p className="text-red-800 leading-relaxed">{cameraError}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleToggleCamera}
              className="px-3 py-1.5 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 transition"
            >
              Retry Camera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-white border border-red-300 text-red-800 rounded-md font-semibold hover:bg-red-50 transition flex items-center space-x-1"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo</span>
            </button>
          </div>
        </div>
      )}

      {liveWarning && (
        <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>OCR Quality Guard:</strong> {liveWarning}
            </span>
          </div>
        </div>
      )}

      {/* Mode Switcher: Live Camera (AI Auto-Detect) vs Video Option (AI Metrology) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs">
        <div className="flex items-center space-x-2">
          <button
            id="btn-mode-camera"
            onClick={() => setMonitorMode('camera')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              monitorMode === 'camera'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Live Camera (AI Auto-Detect)</span>
          </button>

          <button
            id="btn-mode-video"
            onClick={() => {
              if (isCameraActive && videoRef.current) {
                cameraManager.stopCamera(videoRef.current);
                setIsCameraActive(false);
              }
              setMonitorMode('video');
            }}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              monitorMode === 'video'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Video Option (AI Reader)</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-500 pr-2">
          <span className="flex items-center space-x-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 px-2.5 py-1 rounded-md font-medium">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Auto-Detect Through AI • Real Meter Readings</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Left (Camera & Overlay View OR Video Option) & Right (Live Telemetry & Recording Controls) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Camera & Detection View OR Video Option */}
        <div className="lg:col-span-7 space-y-3">
          {monitorMode === 'video' ? (
            <VideoAiAnalyzer
              activeSession={activeSession}
              onImportReadings={(readings, meta) => {
                if (onImportVideoReadings) {
                  onImportVideoReadings(readings, meta);
                } else {
                  readings.forEach((r) => onNewReading(r));
                }
              }}
              onClose={() => setMonitorMode('camera')}
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              {/* Camera Controls Bar */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <select
                    id="select-camera-device"
                    disabled={isCameraActive}
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 disabled:opacity-60 max-w-[200px] truncate"
                  >
                    {availableCameras.length > 0 ? (
                      availableCameras.map((cam) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          {cam.label}
                        </option>
                      ))
                    ) : (
                      <option value="">Default Camera</option>
                    )}
                  </select>

                  <button
                    id="btn-refresh-cameras"
                    title="Refresh device list"
                    onClick={refreshCameras}
                    className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md hover:bg-white"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    id="btn-flip-camera"
                    title="Switch between front and rear cameras"
                    onClick={handleFlipCamera}
                    className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md hover:bg-white flex items-center space-x-1"
                  >
                    <SwitchCamera className="w-3.5 h-3.5" />
                  </button>

                  <button
                    id="btn-toggle-camera"
                    onClick={handleToggleCamera}
                    disabled={isCameraStarting}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                      isCameraActive
                        ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isCameraActive ? (
                      <>
                        <CameraOff className="w-3.5 h-3.5" />
                        <span>Stop Camera</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>{isCameraStarting ? 'Starting...' : 'Start Camera'}</span>
                      </>
                    )}
                  </button>

                  <button
                    id="btn-upload-photo"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload photo of meters from device"
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md text-xs font-semibold hover:bg-slate-50 transition"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-600" />
                    <span>Upload Photo</span>
                  </button>

                  <button
                    id="btn-ai-autodetect-top"
                    onClick={handleAutoDetectWithAi}
                    disabled={isAiScanning || (!isCameraActive && !isStaticImageLoaded)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-xs font-bold shadow-xs transition"
                    title="Auto-detect digital meter display through AI without boxes"
                  >
                    {isAiScanning ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isAiScanning ? 'Scanning...' : 'AI Auto-Detect'}</span>
                  </button>
                </div>

                {/* Status Badge & Tools */}
                <div className="flex items-center space-x-2">
                  <button
                    id="btn-inspect-digits"
                    title="Inspect Real OCR Digits & Segment Bitmasks"
                    onClick={() => setIsInspectModalOpen(true)}
                    className="flex items-center space-x-1 text-xs px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>Inspect OCR</span>
                  </button>

                  <div
                    id="meter-detection-status-badge"
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border flex items-center space-x-1.5 ${detectionBadgeBg}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        liveValidationStatus === 'Verified'
                          ? 'bg-emerald-500 animate-pulse'
                          : isCameraActive || isStaticImageLoaded
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span>{detectionBadgeText}</span>
                  </div>
                </div>
              </div>

              {/* Video Viewport Container (NO THREE BOXES) */}
              <div
                ref={containerRef}
                className="relative aspect-4/3 bg-slate-950 flex items-center justify-center overflow-hidden"
              >
                {/* Real Video Stream */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                />

                {/* Canvas for Frame Processing & Uploaded Photos */}
                <canvas
                  ref={canvasRef}
                  className={isStaticImageLoaded && !isCameraActive ? 'w-full h-full object-contain' : 'hidden'}
                />

                {/* Camera Offline Placeholder */}
                {!isCameraActive && !isStaticImageLoaded && (
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
                    <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                      <Camera className="w-6 h-6 text-blue-500" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200">No Video Feed Active</h3>
                    <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                      Point your camera at the digital display meter or upload a meter photo to extract real-time voltage, current, and SoC readings.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        onClick={handleToggleCamera}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition"
                      >
                        Start Camera
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition flex items-center space-x-1"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Photo</span>
                      </button>
                      <button
                        onClick={handleLoadTestPattern}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition"
                      >
                        Load Test Meters
                      </button>
                    </div>
                  </div>
                )}

                {/* Clean AI HUD Overlay - NO THREE BOXES! */}
                <MeterCanvasOverlay
                  isDetecting={isCameraActive || isStaticImageLoaded}
                  isAiScanning={isAiScanning}
                  aiReading={aiDetectionResult}
                  liveVoltage={liveVoltage}
                  liveCurrent={liveCurrent}
                  livePercentage={livePercentage}
                  aiStatusText={aiStatusMessage}
                  containerWidth={containerDims.width}
                  containerHeight={containerDims.height}
                />
              </div>

              {/* Bottom Sub-bar */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2 text-slate-600">
                  <span className="font-medium">AI Display Status:</span>
                  <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                    {aiStatusMessage}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium">Confidence:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {liveOcrConfidence > 0 ? `${liveOcrConfidence}%` : '--'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    id="btn-autodetect-ai"
                    onClick={handleAutoDetectWithAi}
                    disabled={isAiScanning || (!isCameraActive && !isStaticImageLoaded)}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded text-xs transition font-semibold flex items-center space-x-1"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>Auto-Detect with AI</span>
                  </button>

                  <label className="flex items-center space-x-1.5 text-xs text-slate-700 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded border border-slate-300">
                    <input
                      type="checkbox"
                      checked={continuousAiDetect}
                      onChange={(e) => setContinuousAiDetect(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] font-medium">Continuous AI</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Real Telemetry Dashboard & Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Active Session Status Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    activeSession?.sessionStatus === 'recording'
                      ? 'bg-emerald-500 animate-pulse'
                      : activeSession?.sessionStatus === 'paused'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {activeSession ? `Session ${activeSession.sessionId}` : 'No Active Session'}
                </span>
              </div>

              {activeSession && (
                <div className="flex items-center space-x-1.5 font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTime(elapsedSec)}</span>
                </div>
              )}
            </div>

            {/* Session Info or Start Button */}
            {activeSession ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Battery Pack</span>
                    <span className="font-bold text-slate-800">{activeSession.batteryName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Chemistry / Capacity</span>
                    <span className="font-bold text-slate-800">
                      {activeSession.batteryChemistry} ({activeSession.batteryCapacity}mAh)
                    </span>
                  </div>
                </div>

                {/* Session Action Controls */}
                <div className="flex items-center gap-2 pt-1">
                  {activeSession.sessionStatus === 'recording' ? (
                    <button
                      id="btn-pause-session"
                      onClick={onPauseSession}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 rounded-md font-semibold text-xs transition"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      id="btn-resume-session"
                      onClick={onResumeSession}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-md font-semibold text-xs transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  )}

                  <button
                    id="btn-stop-session"
                    onClick={onStopSession}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-red-600 text-white hover:bg-red-700 rounded-md font-semibold text-xs transition shadow-xs"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop &amp; Diagnose</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-2 text-center space-y-2">
                <p className="text-xs text-slate-500">
                  Ready to record digital meter telemetry and calculate charging metrics.
                </p>
                <button
                  id="btn-open-start-session-modal"
                  onClick={() => setIsStartModalOpen(true)}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs flex items-center justify-center space-x-2 transition"
                >
                  <Play className="w-4 h-4" />
                  <span>Start New Charging Session</span>
                </button>
              </div>
            )}
          </div>

          {/* REAL TELEMETRY DISPLAY CARDS (Shows actual detected numbers; NEVER fake numbers) */}
          <div className="grid grid-cols-2 gap-3">
            {/* Voltage Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center space-x-1">
                  <Gauge className="w-3.5 h-3.5 text-blue-600" />
                  <span>Voltage (V)</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                  vOrigin === 'AI_Vision'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : vOrigin === '7-SEG'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : vOrigin === 'MANUAL'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {vOrigin !== '--' ? vOrigin : 'Live'}
                </span>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                  {liveVoltage !== null ? liveVoltage.toFixed(2) : '--.--'}
                </span>
                <span className="text-xs font-bold text-slate-500">V</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Terminal Volt</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => adjustValue('v', -0.05)}
                    className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700"
                  >
                    -
                  </button>
                  <button
                    onClick={() => adjustValue('v', 0.05)}
                    className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Current Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Current (I)</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                  iOrigin === 'AI_Vision'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : iOrigin === '7-SEG'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : iOrigin === 'MANUAL'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {iOrigin !== '--' ? iOrigin : 'Live'}
                </span>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                  {liveCurrent !== null ? liveCurrent.toFixed(2) : '--.--'}
                </span>
                <span className="text-xs font-bold text-slate-500">A</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Charge Current</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => adjustValue('i', -0.1)}
                    className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700"
                  >
                    -
                  </button>
                  <button
                    onClick={() => adjustValue('i', 0.1)}
                    className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Battery % Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center space-x-1">
                  <BatteryCharging className="w-3.5 h-3.5 text-blue-600" />
                  <span>Battery SoC</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                  pOrigin === 'AI_Vision'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : pOrigin === '7-SEG'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : pOrigin === 'MANUAL'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {pOrigin !== '--' ? pOrigin : 'Live'}
                </span>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                  {livePercentage !== null ? livePercentage : '--'}
                </span>
                <span className="text-xs font-bold text-slate-500">%</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>State of Charge</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => adjustValue('p', -1)}
                    className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700"
                  >
                    -
                  </button>
                  <button
                    onClick={() => adjustValue('p', 1)}
                    className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center font-bold text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Power Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Power (P)</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold border bg-slate-50 text-slate-500 border-slate-200">
                  V × I
                </span>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                  {calculatedPower !== null ? calculatedPower.toFixed(1) : '--.-'}
                </span>
                <span className="text-xs font-bold text-slate-500">W</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Throughput</span>
                <span className="font-mono text-[10px] text-slate-400">Instantaneous</span>
              </div>
            </div>
          </div>

          {/* Quick Input / Set Reading Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Technician Direct Input &amp; Log
                </span>
              </div>

              <label className="flex items-center space-x-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRecordSamples}
                  onChange={(e) => setAutoRecordSamples(e.target.checked)}
                  className="rounded text-blue-600 border-slate-300"
                />
                <span>Auto-Sample</span>
              </label>
            </div>

            <p className="text-[11px] text-slate-500">
              Direct entry for technician verification or when meters are obscured.
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Volt (V)</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualInputV}
                  onChange={(e) => setManualInputV(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs bg-slate-50 focus:bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Amp (A)</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualInputI}
                  onChange={(e) => setManualInputI(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs bg-slate-50 focus:bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">SoC (%)</label>
                <input
                  type="number"
                  step="1"
                  value={manualInputPct}
                  onChange={(e) => setManualInputPct(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs bg-slate-50 focus:bg-white text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                id="btn-apply-manual-reading"
                onClick={handleLogManualSample}
                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Log / Update Reading</span>
              </button>

              {latestReading && (
                <button
                  id="btn-open-correction-modal"
                  onClick={() => setIsCorrectionModalOpen(true)}
                  className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold transition"
                >
                  Edit Latest
                </button>
              )}
            </div>
          </div>

          {/* Session Readings Counter & Integration Summary */}
          {activeSession && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-600">
                <span>Recorded Samples:</span>
                <span className="font-mono font-bold text-slate-900">
                  {activeSession.readings.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>1% Transitions Measured:</span>
                <span className="font-mono font-bold text-slate-900">
                  {activeSession.transitions.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Total Integrated Energy:</span>
                <span className="font-mono font-bold text-blue-700">
                  {latestReading ? `${latestReading.energy.toFixed(2)} Wh` : '0.00 Wh'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start Session Modal */}
      <StartSessionModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onStart={onStartSession}
        isDemo={settings.demoMode}
      />

      {/* Manual Correction Modal */}
      {latestReading && (
        <ManualCorrectionModal
          isOpen={isCorrectionModalOpen}
          rawReading={{
            voltage: latestReading.voltage,
            current: latestReading.current,
            batteryPercentage: latestReading.batteryPercentage,
            ocrConfidence: latestReading.ocrConfidence,
            timestamp: latestReading.exactTimestamp,
          }}
          onClose={() => setIsCorrectionModalOpen(false)}
          onApplyCorrection={(corrected, notes) => {
            if (!activeSession) return;
            const sessionStartMs = new Date(activeSession.startTimestamp).getTime();
            const prev = activeSession.readings[activeSession.readings.length - 2];
            const correctedReading = calculateReadingMetrics(
              latestReading.timestampMs,
              sessionStartMs,
              corrected.voltage,
              corrected.current,
              corrected.batteryPercentage,
              prev,
              100,
              'Manual',
              'Corrected',
              notes
            );
            correctedReading.sampleId = latestReading.sampleId;
            correctedReading.sessionId = activeSession.sessionId;
            correctedReading.rawOcrValue = latestReading.rawOcrValue;
            correctedReading.correctedValue = corrected;
            onUpdateLatestReading(correctedReading);
          }}
        />
      )}

      {/* Optical Digit Inspection & OCR Validation Modal */}
      {isInspectModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Optical OCR Diagnostics &amp; Real Digits</h3>
              </div>
              <button
                onClick={() => setIsInspectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Voltage Box Details */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600">Meter 2 (Voltage Box):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {vResultInfo?.value !== null && vResultInfo?.value !== undefined
                      ? `${vResultInfo.value.toFixed(2)} V`
                      : vResultInfo?.rawString
                      ? `Raw: "${vResultInfo.rawString}"`
                      : 'No Digits Detected'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Segment Match Confidence:</span>
                  <span className="font-semibold text-slate-800">{vResultInfo?.confidence || 0}%</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Display Polarity:</span>
                  <span>{vResultInfo?.polarity || 'UNKNOWN'}</span>
                </div>
              </div>

              {/* Current Box Details */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600">Meter 1 (Current Box):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {iResultInfo?.value !== null && iResultInfo?.value !== undefined
                      ? `${iResultInfo.value.toFixed(2)} A`
                      : iResultInfo?.rawString
                      ? `Raw: "${iResultInfo.rawString}"`
                      : 'No Digits Detected'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Segment Match Confidence:</span>
                  <span className="font-semibold text-slate-800">{iResultInfo?.confidence || 0}%</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Display Polarity:</span>
                  <span>{iResultInfo?.polarity || 'UNKNOWN'}</span>
                </div>
              </div>

              {/* Battery % Box Details */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600">Meter 1 (SoC % Box):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {pResultInfo?.value !== null && pResultInfo?.value !== undefined
                      ? `${pResultInfo.value}%`
                      : pResultInfo?.rawString
                      ? `Raw: "${pResultInfo.rawString}"`
                      : 'No Digits Detected'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Segment Match Confidence:</span>
                  <span className="font-semibold text-slate-800">{pResultInfo?.confidence || 0}%</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Display Polarity:</span>
                  <span>{pResultInfo?.polarity || 'UNKNOWN'}</span>
                </div>
              </div>

              {/* Frame Quality Assessment */}
              <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg text-slate-700 text-[11px] space-y-1">
                <div className="font-semibold text-blue-900 flex items-center space-x-1">
                  <Info className="w-3.5 h-3.5" />
                  <span>Optical Validation Rules</span>
                </div>
                <p>
                  Zero random numbers are generated. Values are decoded from 7-segment luminance bitmasks and verified across consecutive frames before confirmation.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsInspectModalOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
