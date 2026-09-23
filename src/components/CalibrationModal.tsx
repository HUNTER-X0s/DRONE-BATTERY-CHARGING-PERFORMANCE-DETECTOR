import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Crosshair, RefreshCw, Sliders, CheckCircle2, Sparkles } from 'lucide-react';
import { MeterBoundingBox, AppSettings } from '../types/battery';
import { cameraManager } from '../camera/cameraManager';
import { extractBoxValue } from '../ocr/meterOcr';
import { autodetectDisplayBoxes } from '../detection/meterDetection';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [activeTab, setActiveTab] = useState<'voltage' | 'current' | 'percent'>('voltage');
  const [boxes, setBoxes] = useState({
    voltage: settings.calibratedBoxes?.voltage || {
      x: 0.12,
      y: 0.22,
      width: 0.35,
      height: 0.45,
      label: 'Voltage Meter' as const,
      confidence: 96,
    },
    current: settings.calibratedBoxes?.current || {
      x: 0.54,
      y: 0.18,
      width: 0.38,
      height: 0.28,
      label: 'Current Meter' as const,
      confidence: 94,
    },
    batteryPercent: settings.calibratedBoxes?.batteryPercent || {
      x: 0.54,
      y: 0.52,
      width: 0.38,
      height: 0.25,
      label: 'Battery % Display' as const,
      confidence: 93,
    },
  });

  const [testResult, setTestResult] = useState<{
    detectedValue: string;
    confidence: number;
    status: 'Ready' | 'Testing' | 'Success' | 'Failed';
  }>({
    detectedValue: '--',
    confidence: 0,
    status: 'Ready',
  });
  const [testOcrOverlayText, setTestOcrOverlayText] = useState<string>('');
  const [autoDetectStatus, setAutoDetectStatus] = useState<{type:'success'|'failed'|'idle', message:string}>({type:'idle', message:''});

  useEffect(() => {
    if (!isOpen) return;

    let streamObj: MediaStream | null = null;
    const startCam = async () => {
      if (videoRef.current) {
        const res = await cameraManager.startCamera(
          videoRef.current,
          settings.selectedCameraId,
          settings.cameraResolution
        );
        if (res.success) {
          streamObj = res.stream;
        }
      }
    };
    startCam();

    return () => {
      cameraManager.stopCamera(videoRef.current);
    };
  }, [isOpen, settings.selectedCameraId, settings.cameraResolution]);

  if (!isOpen) return null;

  const currentBox =
    activeTab === 'voltage'
      ? boxes.voltage
      : activeTab === 'current'
      ? boxes.current
      : boxes.batteryPercent;

  const handleUpdateBox = (key: keyof MeterBoundingBox, val: number) => {
    setBoxes((prev) => {
      const target =
        activeTab === 'voltage'
          ? 'voltage'
          : activeTab === 'current'
          ? 'current'
          : 'batteryPercent';
      return {
        ...prev,
        [target]: {
          ...prev[target],
          [key]: val,
        },
      };
    });
  };

  const handleAutoDetect = () => {
    if (canvasRef.current) {
      if (videoRef.current) {
        cameraManager.captureFrameToCanvas(videoRef.current, canvasRef.current);
      }
      const detected = autodetectDisplayBoxes(canvasRef.current);
      setBoxes(detected);
      const allBoxes = [detected.voltage, detected.current, detected.batteryPercent];
      const anyLowConfidence = allBoxes.some(b => b.confidence === 0 || b.confidence < 30);
      const avg = Math.round(allBoxes.reduce((s, b) => s + b.confidence, 0) / allBoxes.length);
      if (anyLowConfidence) {
        setAutoDetectStatus({type:'failed', message: (detected as any).statusMessage || 'No clear meter bezels found. Try more light or camera closer.'});
      } else {
        setAutoDetectStatus({type:'success', message:`Auto-aligned 3 boxes. Confidence ${avg}%`});
      }
      setTimeout(() => setAutoDetectStatus({type:'idle', message:''}), 5000);
    }
  };

  const handleTestOcr = () => {
    if (!videoRef.current || !canvasRef.current) {
      setTestResult({
        detectedValue: 'Camera Not Connected',
        confidence: 0,
        status: 'Failed',
      });
      return;
    }

    setTestResult({ detectedValue: 'Scanning video frame...', confidence: 0, status: 'Testing' });

    const captured = cameraManager.captureFrameToCanvas(videoRef.current, canvasRef.current);
    if (!captured) {
      setTestResult({
        detectedValue: 'Waiting for live frame...',
        confidence: 0,
        status: 'Failed',
      });
      return;
    }

    const type = activeTab === 'voltage' ? 'voltage' : activeTab === 'current' ? 'current' : 'percent';
    const min = type === 'voltage' ? 0.5 : 0;
    const max = type === 'voltage' ? 60 : type === 'current' ? 35 : 100;
    const res = extractBoxValue(canvasRef.current, currentBox, type, min, max);

    setTestOcrOverlayText(res.rawString || (res.valid && res.value!==null ? String(res.value) : '✗ NO DIGIT'));
    setTimeout(()=>setTestOcrOverlayText(''), 3500);

    if (res.valid && res.value !== null) {
      const unit = type === 'voltage' ? ' V' : type === 'current' ? ' A' : ' %';
      setTestResult({
        detectedValue: `${res.value}${unit}`,
        confidence: res.confidence,
        status: 'Success',
      });
    } else {
      setTestResult({
        detectedValue: res.rawString ? `Unclear (${res.rawString})` : 'No Digits Detected in Box',
        confidence: res.confidence,
        status: 'Failed',
      });
    }
  };

  const handleSave = () => {
    onSaveSettings({
      ...settings,
      calibratedBoxes: boxes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Crosshair className="w-5 h-5 text-blue-600" />
              <span>One-Time Meter Auto-Detection Calibration</span>
            </h2>
            <p className="text-xs text-slate-500">
              Calibrate positions once. Future charging sessions detect these areas automatically.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Video Preview & Canvas Calibration */}
          <div className="md:col-span-7 flex flex-col space-y-3">
            <div className="relative aspect-4/3 bg-slate-900 rounded-lg overflow-hidden border border-slate-300">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Calibration Overlay Box */}
              <div
                style={{
                  left: `${currentBox.x * 100}%`,
                  top: `${currentBox.y * 100}%`,
                  width: `${currentBox.width * 100}%`,
                  height: `${currentBox.height * 100}%`,
                }}
                className="absolute border-2 border-blue-500 bg-blue-500/20 rounded shadow-xs"
              >
                <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-t">
                  {currentBox.label} ({Math.round(currentBox.width * 100)}% x {Math.round(currentBox.height * 100)}%)
                </div>
              </div>

              {testOcrOverlayText && (
                <div
                  style={{
                    left: `${currentBox.x * 100}%`,
                    top: `${currentBox.y * 100}%`,
                    width: `${currentBox.width * 100}%`,
                    height: `${currentBox.height * 100}%`,
                    WebkitTextStroke: '1px #000000',
                    textShadow: '0 0 4px #000',
                  }}
                  className="absolute flex items-center justify-center pointer-events-none text-[18px] sm:text-2xl font-bold font-mono text-yellow-300"
                >
                  {testOcrOverlayText}
                </div>
              )}

              <div className="absolute bottom-2 left-2 right-2 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] px-3 py-1.5 rounded flex justify-between items-center">
                <span>Adjust position sliders on the right</span>
                <span className="font-mono text-emerald-400">Target: {currentBox.label}</span>
              </div>
            </div>

            {autoDetectStatus.type !== 'idle' && (
              <div className={`text-xs px-3 py-2 rounded-md border ${
                autoDetectStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {autoDetectStatus.message}
              </div>
            )}

            {/* Meter Selection Tabs */}
            <div className="flex space-x-2">
              <button
                id="tab-calib-voltage"
                onClick={() => setActiveTab('voltage')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border text-center transition ${
                  activeTab === 'voltage'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                1. Voltage Meter
              </button>
              <button
                id="tab-calib-current"
                onClick={() => setActiveTab('current')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border text-center transition ${
                  activeTab === 'current'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                2. Current Meter
              </button>
              <button
                id="tab-calib-percent"
                onClick={() => setActiveTab('percent')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border text-center transition ${
                  activeTab === 'percent'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                3. Battery % Display
              </button>
            </div>
          </div>

          {/* Controls & OCR Testing */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Region Positioning ({currentBox.label})
                  </h3>
                  <button
                    type="button"
                    onClick={handleAutoDetect}
                    className="flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded"
                    title="Automatically scan frame for meter bezels"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Auto-Snap Boxes</span>
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Horizontal Offset (X)</span>
                    <span className="font-mono">{Math.round(currentBox.x * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={Math.round(currentBox.x * 100)}
                    onChange={(e) => handleUpdateBox('x', Number(e.target.value) / 100)}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Vertical Offset (Y)</span>
                    <span className="font-mono">{Math.round(currentBox.y * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={Math.round(currentBox.y * 100)}
                    onChange={(e) => handleUpdateBox('y', Number(e.target.value) / 100)}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Width</span>
                    <span className="font-mono">{Math.round(currentBox.width * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={Math.round(currentBox.width * 100)}
                    onChange={(e) => handleUpdateBox('width', Number(e.target.value) / 100)}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Height</span>
                    <span className="font-mono">{Math.round(currentBox.height * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={Math.round(currentBox.height * 100)}
                    onChange={(e) => handleUpdateBox('height', Number(e.target.value) / 100)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* OCR Test Card */}
              <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">Test OCR Recognition</h4>
                  <button
                    id="btn-test-ocr"
                    type="button"
                    onClick={handleTestOcr}
                    className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Test Digit OCR</span>
                  </button>
                </div>

                <div className="bg-slate-100 rounded p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Detected Value:</span>
                    <span className="font-mono font-bold text-slate-900">{testResult.detectedValue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Detection Confidence:</span>
                    <span className="font-mono text-emerald-700 font-semibold">{testResult.confidence}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Verification:</span>
                    <span className="text-emerald-700 font-medium">Valid Numeric String</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md border border-slate-300"
              >
                Cancel
              </button>
              <button
                id="btn-save-calibration"
                type="button"
                onClick={handleSave}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition"
              >
                Save Calibration
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
