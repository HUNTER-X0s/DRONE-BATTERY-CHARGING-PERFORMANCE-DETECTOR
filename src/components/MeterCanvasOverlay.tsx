import React from 'react';
import { Sparkles, CheckCircle2, RefreshCw, Zap, Gauge } from 'lucide-react';
import { AiDisplayDetectionResult } from '../types/battery';

interface MeterCanvasOverlayProps {
  isDetecting: boolean;
  isAiScanning?: boolean;
  aiReading?: AiDisplayDetectionResult | null;
  liveVoltage?: number | null;
  liveCurrent?: number | null;
  livePercentage?: number | null;
  aiStatusText?: string;
  containerWidth: number;
  containerHeight: number;
  // Kept for backward compatibility if passed, but NEVER rendered as 3 boxes!
  voltageBox?: any;
  currentBox?: any;
  batteryPercentBox?: any;
}

export const MeterCanvasOverlay: React.FC<MeterCanvasOverlayProps> = ({
  isDetecting,
  isAiScanning,
  aiReading,
  liveVoltage,
  liveCurrent,
  livePercentage,
  aiStatusText,
  containerWidth,
  containerHeight,
}) => {
  if (!isDetecting || containerWidth === 0 || containerHeight === 0) {
    return null;
  }

  const v = liveVoltage ?? aiReading?.voltage ?? null;
  const i = liveCurrent ?? aiReading?.current ?? null;
  const p = livePercentage ?? aiReading?.batteryPercentage ?? null;
  const hasReading = (v !== null && v !== undefined) || (i !== null && i !== undefined) || (p !== null && p !== undefined);
  const power = (v !== null && i !== null) ? Number((v * i).toFixed(2)) : (aiReading?.power ?? null);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex flex-col justify-between p-3 sm:p-4">
      {/* Precision Reticle Frame in Corners (Optical Metrology HUD) */}
      <div className="absolute inset-4 border border-white/20 rounded-lg pointer-events-none">
        {/* Top-Left Reticle */}
        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-indigo-400" />
        {/* Top-Right Reticle */}
        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-indigo-400" />
        {/* Bottom-Left Reticle */}
        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-indigo-400" />
        {/* Bottom-Right Reticle */}
        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-indigo-400" />
      </div>

      {/* Top AI Detection Status HUD */}
      <div className="flex items-center justify-between z-10">
        <div className="bg-slate-950/85 backdrop-blur-md text-white border border-white/15 rounded-full px-3.5 py-1.5 flex items-center space-x-2 text-xs shadow-lg">
          {isAiScanning ? (
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="font-semibold tracking-tight text-slate-100">AI Meter Vision</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slate-300 font-mono">
            {isAiScanning ? 'Scanning Meter Displays...' : aiStatusText || 'Active'}
          </span>
        </div>

        {aiReading?.confidence ? (
          <div className="bg-slate-950/85 backdrop-blur-md text-emerald-400 border border-emerald-500/40 rounded-full px-3 py-1 text-[11px] font-mono font-semibold shadow-lg flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>AI Confidence: {aiReading.confidence}%</span>
          </div>
        ) : null}
      </div>

      {/* Subtle Horizontal Scanning Line when AI is evaluating */}
      {isAiScanning && (
        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-pulse shadow-[0_0_16px_rgba(99,102,241,0.9)]" />
      )}

      {/* Bottom Live AI Detected Telemetry Pill */}
      {hasReading && (
        <div className="z-10 mx-auto bg-slate-950/95 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2.5 shadow-2xl flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-white">
          {/* Voltage */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-semibold tracking-wider">VOLT</span>
            <span className="font-mono text-sm sm:text-base font-bold text-sky-400">
              {v !== null && v !== undefined ? `${v.toFixed(2)} V` : '--.-- V'}
            </span>
          </div>

          <span className="text-slate-600 font-bold">•</span>

          {/* Current */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-semibold tracking-wider">AMP</span>
            <span className="font-mono text-sm sm:text-base font-bold text-emerald-400">
              {i !== null && i !== undefined ? `${i.toFixed(2)} A` : '--.-- A'}
            </span>
          </div>

          {p !== null && p !== undefined && (
            <>
              <span className="text-slate-600 font-bold">•</span>
              {/* Battery % */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-semibold tracking-wider">SoC</span>
                <span className="font-mono text-sm sm:text-base font-bold text-amber-400">
                  {p} %
                </span>
              </div>
            </>
          )}

          {power !== null && power !== undefined && (
            <>
              <span className="text-slate-600 font-bold">•</span>
              {/* Power W */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-semibold tracking-wider">PWR</span>
                <span className="font-mono text-sm sm:text-base font-bold text-purple-400">
                  {power.toFixed(1)} W
                </span>
              </div>
            </>
          )}

          {aiReading?.chargingPhase && (
            <>
              <span className="text-slate-600 font-bold">•</span>
              <span className="text-[10px] sm:text-[11px] font-semibold text-indigo-200 bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-400/40">
                {aiReading.chargingPhase}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
