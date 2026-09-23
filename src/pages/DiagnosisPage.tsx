import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Info,
  Clock,
  Zap,
  BatteryCharging,
  Gauge,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import { ChargingSession, DiagnosisReport, AbnormalityIssue } from '../types/battery';
import { exportSessionToExcel, exportSessionToCSV } from '../exports/excelExport';
import { generateSessionDiagnosis } from '../calculations/batteryCalculations';

interface DiagnosisPageProps {
  session: ChargingSession | null;
  onNavigateToReports: () => void;
}

export const DiagnosisPage: React.FC<DiagnosisPageProps> = ({ session, onNavigateToReports }) => {
  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Info className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-800">No Session Selected for Diagnosis</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Start and complete a session on the Charging Monitor page or open an existing session from Session History.
        </p>
      </div>
    );
  }

  const diagnosis: DiagnosisReport =
    session.diagnosis || generateSessionDiagnosis(session);

  const getStabilityBadge = (status: string) => {
    switch (status) {
      case 'Normal':
      case 'Stable':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'Review Required':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'Possible Abnormality':
        return 'bg-red-50 text-red-800 border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {diagnosis.isDemo && (
        <div className="bg-amber-400 border-4 border-amber-600 text-amber-950 p-5 rounded-xl mb-6">
          <h2 className="text-2xl uppercase font-bold">⚠️ DEMO / SIMULATED DATA REPORT</h2>
          <p className="text-sm mt-2">
            This session is tagged as DEMO and contains simulated or synthetic data only. These are NOT real physical
            measurements collected from live hardware. Do not use this report for engineering, safety, quality,
            warranty, or commercial decisions. No representation or warranty is made regarding the accuracy,
            completeness, or reliability of the values shown.
          </p>
        </div>
      )}
      {/* Header with Export Action */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-slate-900">Charging Session Diagnosis</h1>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded border ${getStabilityBadge(
                diagnosis.chargingStability
              )}`}
            >
              {diagnosis.chargingStability}
            </span>
            {diagnosis.isDemo && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">
                DEMO MODE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Report ID: <span className="font-mono font-medium">{diagnosis.reportId}</span> • Session ID:{' '}
            <span className="font-mono font-medium">{diagnosis.sessionId}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="btn-diagnosis-export-csv"
            onClick={() => exportSessionToCSV(session)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition"
          >
            Export CSV
          </button>
          <button
            id="btn-diagnosis-export-excel"
            onClick={() => exportSessionToExcel(session)}
            className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel Report</span>
          </button>
        </div>
      </div>

      {/* Grid: Session Info & Summary Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Section 1: Session Information */}
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">
            Session Information
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Battery ID:</span>
              <span className="font-mono font-semibold text-slate-900">{diagnosis.batteryId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Battery Name:</span>
              <span className="font-medium text-slate-800 text-right max-w-[200px] truncate">
                {diagnosis.batteryName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Chemistry:</span>
              <span className="font-medium text-slate-800">{diagnosis.batteryChemistry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Rated Capacity:</span>
              <span className="font-mono font-medium text-slate-900">{diagnosis.batteryCapacity} mAh</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Charger:</span>
              <span className="font-medium text-slate-800">{diagnosis.charger}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Operator:</span>
              <span className="font-medium text-slate-800">{diagnosis.operator}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Start Time:</span>
              <span className="font-mono text-slate-700">{diagnosis.startTimestamp.replace('T', ' ').slice(0, 19)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">End Time:</span>
              <span className="font-mono text-slate-700">{diagnosis.endTimestamp.replace('T', ' ').slice(0, 19)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-100">
              <span className="text-slate-500 font-medium">Total Duration:</span>
              <span className="font-mono font-bold text-blue-700">
                {Math.floor(diagnosis.totalDurationSeconds / 60)} min {diagnosis.totalDurationSeconds % 60} sec
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Charging Summary Statistics */}
        <div className="lg:col-span-8 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Charging Summary
            </h2>
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-500">Data Quality Score:</span>
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {diagnosis.dataQualityScore} / 100
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block">SoC Progression</span>
              <p className="text-lg font-bold font-mono text-slate-900 mt-1">
                {diagnosis.startingPercentage}% → {diagnosis.endingPercentage}%
              </p>
              <span className="text-[11px] font-semibold text-blue-700">
                +{diagnosis.totalPercentageIncrease}% Total Rise
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Terminal Voltage</span>
              <p className="text-lg font-bold font-mono text-slate-900 mt-1">
                {diagnosis.averageVoltage.toFixed(2)} V
              </p>
              <span className="text-[11px] text-slate-500">
                Range: {diagnosis.minimumVoltage.toFixed(2)}V - {diagnosis.maximumVoltage.toFixed(2)}V
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Charge Current</span>
              <p className="text-lg font-bold font-mono text-slate-900 mt-1">
                {diagnosis.averageCurrent.toFixed(2)} A
              </p>
              <span className="text-[11px] text-slate-500">
                Range: {diagnosis.minimumCurrent.toFixed(2)}A - {diagnosis.maximumCurrent.toFixed(2)}A
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Net Energy Delivered</span>
              <p className="text-lg font-bold font-mono text-slate-900 mt-1">
                {diagnosis.totalEnergyWh.toFixed(2)} Wh
              </p>
              <span className="text-[11px] text-slate-500">
                {diagnosis.totalMah.toFixed(0)} mAh ({diagnosis.totalAh.toFixed(2)} Ah)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-100">
            <div>
              <span className="text-slate-500 block">Average / Max Power:</span>
              <span className="font-mono font-semibold text-slate-800">
                {diagnosis.averagePower.toFixed(1)} W / {diagnosis.maximumPower.toFixed(1)} W
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Total Reading Samples:</span>
              <span className="font-mono font-semibold text-slate-800">
                {diagnosis.totalSamples} points logged
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Average OCR Confidence:</span>
              <span className="font-mono font-semibold text-emerald-700">
                {diagnosis.averageOcrConfidence}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Charging Behavior Analysis */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">
          Charging Behavior Analysis
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
            <span className="font-semibold text-slate-700 block">Voltage Curve Characteristic:</span>
            <p className="text-slate-600 leading-relaxed">{diagnosis.voltageBehavior}</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
            <span className="font-semibold text-slate-700 block">Current Delivery Characteristic:</span>
            <p className="text-slate-600 leading-relaxed">{diagnosis.currentBehavior}</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
            <span className="font-semibold text-slate-700 block">Charging Rate &amp; Speed:</span>
            <p className="text-slate-600 leading-relaxed font-mono">{diagnosis.chargingSpeed}</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
            <span className="font-semibold text-slate-700 block">Transition Consistency:</span>
            <p className="text-slate-600 leading-relaxed">{diagnosis.percentageTransitionConsistency}</p>
            <div className="text-[11px] text-slate-500 pt-1">
              Slowest: <span className="font-mono">{diagnosis.slowChargingRanges}</span> • Fastest:{' '}
              <span className="font-mono">{diagnosis.fastChargingRanges}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Warnings & Abnormality Analysis Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Active Warnings &amp; Abnormality Log
          </h2>
          <span className="text-xs text-slate-500">
            {diagnosis.abnormalities.length} issues registered
          </span>
        </div>

        {diagnosis.warnings.length > 0 && (
          <div className="p-4 bg-amber-50/60 border-b border-amber-200 space-y-1.5">
            {diagnosis.warnings.map((w, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs text-amber-900">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Issue ID</th>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Measurement</th>
                <th className="py-2.5 px-4">Severity</th>
                <th className="py-2.5 px-4">Recommended Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {diagnosis.abnormalities.length > 0 ? (
                diagnosis.abnormalities.map((item) => (
                  <tr key={item.issueId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900">{item.issueId}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{item.timestamp.slice(11, 19)}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{item.issueType}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{item.measurement}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          item.severity === 'Critical'
                            ? 'bg-red-100 text-red-800'
                            : item.severity === 'Warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-sm">{item.recommendedReviewAction}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 px-4 text-center text-slate-500">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                    <span>No abnormalities or voltage dips detected during this charging session.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Regulatory & Safety Disclaimer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-start space-x-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            Diagnostic notice: Observations are derived strictly from sampled optical telemetry. Do not make
            definitive battery-health, internal-cell degradation, or safety claims from incomplete measurements.
            Refer to manufacturer C-rating and thermal limits.
          </span>
        </div>
      </div>
    </div>
  );
};
