import React, { useState, useEffect } from 'react';
import {
  Settings,
  Camera,
  Sliders,
  Shield,
  Clock,
  Zap,
  Gauge,
  Database,
  Crosshair,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { AppSettings } from '../types/battery';
import { cameraManager, CameraDeviceInfo } from '../camera/cameraManager';
import { storageService, DEFAULT_SETTINGS } from '../storage/storageService';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onOpenCalibration: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onOpenCalibration,
}) => {
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<string>('Checking...');
  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    cameraManager.getAvailableCameras().then((devices) => {
      setCameras(devices);
    });

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        // @ts-ignore
        .query({ name: 'camera' })
        .then((status) => {
          setCameraPermissionStatus(status.state);
        })
        .catch(() => {
          setCameraPermissionStatus('Available');
        });
    } else {
      setCameraPermissionStatus('Supported');
    }
  }, []);

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    onUpdateSettings(updated);
    storageService.saveSettings(updated);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleResetDefaults = () => {
    onUpdateSettings(DEFAULT_SETTINGS);
    storageService.saveSettings(DEFAULT_SETTINGS);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">System &amp; Laboratory Settings</h1>
          <p className="text-xs text-slate-500">
            Configure camera acquisition, OCR confidence bounds, calibration, and units
          </p>
        </div>

        {saveToast && (
          <div className="flex items-center space-x-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-md">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings Saved</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Section 1: Camera & Hardware Integration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <Camera className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Camera &amp; Video Capture
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Active Camera Device</label>
              <select
                id="select-settings-camera"
                value={settings.selectedCameraId}
                onChange={(e) => handleChange('selectedCameraId', e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-800 text-xs"
              >
                <option value="">Default System Camera</option>
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Resolution Constraint</label>
              <select
                id="select-settings-resolution"
                value={settings.cameraResolution}
                onChange={(e) => handleChange('cameraResolution', e.target.value as any)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-800 text-xs"
              >
                <option value="1280x720">1280 x 720 (HD 720p - Optimal balance)</option>
                <option value="1920x1080">1920 x 1080 (FHD 1080p - High precision)</option>
                <option value="640x480">640 x 480 (VGA - Low compute)</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="font-semibold text-slate-800 block">Browser Camera Permission:</span>
                <span className="text-[11px] text-slate-500">
                  Status reported by browser Navigator API: <strong className="uppercase">{cameraPermissionStatus}</strong>
                </span>
              </div>
              <span className="px-2 py-1 text-xs font-mono font-semibold bg-blue-50 text-blue-700 rounded border border-blue-200">
                Webcam / USB Ready
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Meter Detection Calibration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <Crosshair className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Automatic Meter Detection &amp; Calibration
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="space-y-1 text-xs">
              <h3 className="font-bold text-slate-900">One-Time Position Calibration</h3>
              <p className="text-slate-600 max-w-lg leading-relaxed">
                Calibrate the bounding areas of Meter 1 (Current &amp; Battery %) and Meter 2 (Voltage).
                After completing calibration once, the system automatically detects these regions for all subsequent
                charging sessions.
              </p>
            </div>
            <button
              id="btn-settings-open-calibration"
              onClick={onOpenCalibration}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md shadow-xs flex items-center space-x-2 shrink-0 transition"
            >
              <Crosshair className="w-4 h-4" />
              <span>Calibrate Meters</span>
            </button>
          </div>
        </div>

        {/* Section 3: Sampling & OCR Thresholds */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Sampling &amp; Telemetry Integration
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Reading Interval / Sampling Rate
              </label>
              <select
                id="select-sampling-interval"
                value={settings.samplingIntervalMs}
                onChange={(e) => handleChange('samplingIntervalMs', Number(e.target.value))}
                className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-800 text-xs font-mono"
              >
                <option value={1000}>1,000 ms (1.0 second per sample)</option>
                <option value={2000}>2,000 ms (2.0 seconds - Recommended)</option>
                <option value={5000}>5,000 ms (5.0 seconds)</option>
                <option value={10000}>10,000 ms (10.0 seconds)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                OCR Minimum Confidence Threshold ({settings.ocrMinConfidenceThreshold}%)
              </label>
              <input
                id="input-ocr-threshold"
                type="range"
                min="50"
                max="95"
                step="5"
                value={settings.ocrMinConfidenceThreshold}
                onChange={(e) => handleChange('ocrMinConfidenceThreshold', Number(e.target.value))}
                className="w-full"
              />
              <span className="text-[11px] text-slate-400">
                Readings falling below this threshold trigger an inspection warning.
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Operational Mode & Simulation */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Operational Modes &amp; Units
            </h2>
          </div>

          {/* Demo Mode Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 flex items-center space-x-2">
                <span>Demo Mode (Virtual Hardware Simulation)</span>
                {settings.demoMode && (
                  <span className="px-2 py-0.5 text-[10px] uppercase font-bold bg-amber-200 text-amber-900 rounded">
                    Active
                  </span>
                )}
              </span>
              <p className="text-xs text-slate-500">
                Simulates live digital meter readings, realistic CC/CV battery curve, and full diagnosis when hardware is unavailable.
              </p>
            </div>

            <button
              id="btn-toggle-demo-mode"
              type="button"
              onClick={() => handleChange('demoMode', !settings.demoMode)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                settings.demoMode ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  settings.demoMode ? 'left-6.5' : 'left-0.5'
                } shadow-xs`}
              />
            </button>
          </div>

          {/* Units */}
          <div className="grid grid-cols-3 gap-3 text-xs pt-2">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Voltage Unit</label>
              <input
                type="text"
                disabled
                value="V (Volts)"
                className="w-full bg-slate-100 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-700"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Current Unit</label>
              <input
                type="text"
                disabled
                value="A (Amperes)"
                className="w-full bg-slate-100 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-700"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Energy Unit</label>
              <input
                type="text"
                disabled
                value="Wh (Watt-hours)"
                className="w-full bg-slate-100 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-700"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Reset to Defaults */}
        <div className="flex items-center justify-between pt-2">
          <button
            id="btn-reset-defaults"
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md hover:bg-slate-100 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Laboratory Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
};
