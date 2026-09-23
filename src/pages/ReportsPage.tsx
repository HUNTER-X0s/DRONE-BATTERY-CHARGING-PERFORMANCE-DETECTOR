import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Eye,
  X,
  Play,
  TrendingUp,
  Clock,
  Zap,
  BatteryCharging,
  Gauge,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { ChargingSession } from '../types/battery';
import { exportSessionToExcel, exportSessionToCSV } from '../exports/excelExport';
import { generateSessionDiagnosis } from '../calculations/batteryCalculations';

interface ReportsPageProps {
  sessions: ChargingSession[];
  onStartNewSession: () => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ sessions, onStartNewSession }) => {
  const [selectedSession, setSelectedSession] = useState<ChargingSession | null>(
    sessions.length > 0 ? sessions[0] : null
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  const handleOpenPreview = (session: ChargingSession) => {
    setSelectedSession(session);
    setIsPreviewOpen(true);
  };

  const activeDiagnosis = selectedSession
    ? selectedSession.diagnosis || generateSessionDiagnosis(selectedSession)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Reports &amp; Diagnosis Archives</h1>
          <p className="text-xs text-slate-500">
            Export laboratory Excel workbooks conforming to the reference digitization format
          </p>
        </div>
        <button
          id="btn-reports-start-new-session"
          onClick={onStartNewSession}
          className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Start New Session</span>
        </button>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Report ID</th>
                <th className="py-3 px-4">Session ID</th>
                <th className="py-3 px-4">Battery ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">SoC Range</th>
                <th className="py-3 px-4">Total Energy</th>
                <th className="py-3 px-4">Total mAh</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sessions.map((ses) => {
                const diag = ses.diagnosis || generateSessionDiagnosis(ses);
                const reportId = diag.reportId;
                const dateStr = ses.startTimestamp.slice(0, 10);
                const durationMin = Math.round(ses.totalDurationSeconds / 60);

                return (
                  <tr key={ses.sessionId} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-medium text-blue-700">{reportId}</td>
                    <td className="py-3 px-4 font-mono text-slate-800">{ses.sessionId}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{ses.batteryId}</td>
                    <td className="py-3 px-4 text-slate-600">{dateStr}</td>
                    <td className="py-3 px-4 text-slate-600">{durationMin} min</td>
                    <td className="py-3 px-4 font-mono">
                      {diag.startingPercentage}% → {diag.endingPercentage}%
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-800">{diag.totalEnergyWh.toFixed(2)} Wh</td>
                    <td className="py-3 px-4 font-mono text-slate-800">{diag.totalMah.toFixed(0)} mAh</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {diag.chargingStability}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      <button
                        id={`btn-view-report-${ses.sessionId}`}
                        onClick={() => handleOpenPreview(ses)}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition"
                      >
                        View
                      </button>
                      <button
                        id={`btn-export-excel-${ses.sessionId}`}
                        onClick={() => exportSessionToExcel(ses)}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded transition"
                      >
                        Export Excel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Web Report Preview Modal / Drawer */}
      {isPreviewOpen && selectedSession && activeDiagnosis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-5xl w-full overflow-hidden flex flex-col max-h-[94vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span>Web Report Preview &amp; Analysis</span>
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedSession.batteryName} • Report {activeDiagnosis.reportId}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  id="btn-preview-print"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Report</span>
                </button>
                <button
                  id="btn-preview-export-csv"
                  onClick={() => exportSessionToCSV(selectedSession)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
                >
                  Export CSV
                </button>
                <button
                  id="btn-preview-export-excel"
                  onClick={() => exportSessionToExcel(selectedSession)}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md flex items-center space-x-1.5 shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Excel</span>
                </button>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200 ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Scrollable Report Content */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Report Title & Metadata Overview */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-slate-500 block">Battery Model:</span>
                  <span className="font-semibold text-slate-900">{selectedSession.batteryName}</span>
                  <span className="block text-[11px] text-slate-500">
                    {selectedSession.batteryChemistry} ({selectedSession.batteryCapacity} mAh)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Session &amp; Charger:</span>
                  <span className="font-mono text-slate-900">{selectedSession.sessionId}</span>
                  <span className="block text-[11px] text-slate-500">{selectedSession.chargerName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Start &amp; End Time:</span>
                  <span className="font-mono text-slate-900">
                    {selectedSession.startTimestamp.replace('T', ' ').slice(0, 19)}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Total: {Math.round(selectedSession.totalDurationSeconds / 60)} minutes
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Throughput:</span>
                  <span className="font-bold text-blue-700 text-sm font-mono">
                    {activeDiagnosis.totalEnergyWh.toFixed(2)} Wh
                  </span>
                  <span className="block text-[11px] font-mono text-slate-600">
                    {activeDiagnosis.totalMah.toFixed(0)} mAh ({activeDiagnosis.totalAh.toFixed(2)} Ah)
                  </span>
                </div>
              </div>

              {/* 4 Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Voltage Range</span>
                  <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                    {activeDiagnosis.startingVoltage.toFixed(2)}V → {activeDiagnosis.endingVoltage.toFixed(2)}V
                  </p>
                  <span className="text-[10px] text-slate-400">Average: {activeDiagnosis.averageVoltage.toFixed(2)}V</span>
                </div>
                <div className="p-3 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Current Range</span>
                  <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                    {activeDiagnosis.startingCurrent.toFixed(2)}A → {activeDiagnosis.endingCurrent.toFixed(2)}A
                  </p>
                  <span className="text-[10px] text-slate-400">Average: {activeDiagnosis.averageCurrent.toFixed(2)}A</span>
                </div>
                <div className="p-3 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Power Range</span>
                  <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                    {activeDiagnosis.averagePower.toFixed(1)} W
                  </p>
                  <span className="text-[10px] text-slate-400">Peak: {activeDiagnosis.maximumPower.toFixed(1)} W</span>
                </div>
                <div className="p-3 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">SoC Increase</span>
                  <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                    +{activeDiagnosis.totalPercentageIncrease}%
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {activeDiagnosis.startingPercentage}% to {activeDiagnosis.endingPercentage}%
                  </span>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Charging Performance Curves
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Chart 1: Voltage & Current vs Time */}
                  <div className="border border-slate-200 p-4 rounded-lg bg-white">
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">
                      Voltage (V) &amp; Current (A) vs Time (min)
                    </h4>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedSession.readings}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="elapsedMinutes" unit="m" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="voltage"
                            stroke="#2563eb"
                            dot={false}
                            name="Voltage (V)"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="current"
                            stroke="#059669"
                            dot={false}
                            name="Current (A)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 2: Battery % & Power vs Time */}
                  <div className="border border-slate-200 p-4 rounded-lg bg-white">
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">
                      Battery SoC (%) &amp; Power (W) vs Time (min)
                    </h4>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedSession.readings}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="elapsedMinutes" unit="m" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="batteryPercentage"
                            stroke="#4f46e5"
                            dot={false}
                            name="SoC (%)"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="power"
                            stroke="#d97706"
                            dot={false}
                            name="Power (W)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Chart 3: Duration for each 1% SoC increase */}
                {selectedSession.transitions.length > 0 && (
                  <div className="border border-slate-200 p-4 rounded-lg bg-white">
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">
                      Time Required for Each 1% Battery Increase (Seconds per Step)
                    </h4>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={selectedSession.transitions}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            dataKey="startPercentage"
                            tickFormatter={(val) => `${val}%`}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis unit="s" tick={{ fontSize: 10 }} />
                          <Tooltip
                            formatter={(val: any) => [`${val} seconds`, 'Duration']}
                            labelFormatter={(label) => `Transition: ${label}% -> ${Number(label) + 1}%`}
                          />
                          <Bar dataKey="duration" fill="#2563eb" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* 1% Transition Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Every 1% Charging Transition Table
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {selectedSession.transitions.length} transitions calculated
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Step</th>
                        <th className="py-2 px-3">Duration</th>
                        <th className="py-2 px-3">Avg Voltage</th>
                        <th className="py-2 px-3">Avg Current</th>
                        <th className="py-2 px-3">Avg Power</th>
                        <th className="py-2 px-3">Energy (Wh)</th>
                        <th className="py-2 px-3">mAh</th>
                        <th className="py-2 px-3">Samples</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedSession.transitions.map((t) => (
                        <tr key={t.transitionId} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono font-medium">
                            {t.startPercentage}% → {t.endPercentage}%
                          </td>
                          <td className="py-1.5 px-3 font-mono">
                            {t.duration}s ({Number((t.duration / 60).toFixed(1))}m)
                          </td>
                          <td className="py-1.5 px-3 font-mono">{t.averageVoltage.toFixed(2)} V</td>
                          <td className="py-1.5 px-3 font-mono">{t.averageCurrent.toFixed(2)} A</td>
                          <td className="py-1.5 px-3 font-mono">{t.averagePower.toFixed(2)} W</td>
                          <td className="py-1.5 px-3 font-mono">{t.energy.toFixed(3)}</td>
                          <td className="py-1.5 px-3 font-mono">{t.mah.toFixed(1)}</td>
                          <td className="py-1.5 px-3 font-mono">{t.sampleCount}</td>
                          <td className="py-1.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                t.status === 'Normal'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Excel workbook contains 6 complete sheets with preserved reference format
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-md border border-slate-300"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => exportSessionToExcel(selectedSession)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs flex items-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel Workbook</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
