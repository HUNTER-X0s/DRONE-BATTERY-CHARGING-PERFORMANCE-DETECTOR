import React, { useState } from 'react';
import {
  Search,
  Filter,
  Trash2,
  FileSpreadsheet,
  Download,
  Eye,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Zap,
} from 'lucide-react';
import { ChargingSession } from '../types/battery';
import { exportSessionToExcel, exportSessionToCSV } from '../exports/excelExport';
import { generateSessionDiagnosis } from '../calculations/batteryCalculations';

interface SessionHistoryPageProps {
  sessions: ChargingSession[];
  onOpenSession: (session: ChargingSession) => void;
  onDeleteSession: (sessionId: string) => void;
}

export const SessionHistoryPage: React.FC<SessionHistoryPageProps> = ({
  sessions,
  onOpenSession,
  onDeleteSession,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterChemistry, setFilterChemistry] = useState('all');
  const [sortField, setSortField] = useState<'date' | 'duration' | 'energy'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sessionToDelete, setSessionToDelete] = useState<ChargingSession | null>(null);

  // Filter & Search
  const filtered = sessions.filter((s) => {
    const matchesSearch =
      s.sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.batteryId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.batteryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.operatorName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesChem =
      filterChemistry === 'all' || s.batteryChemistry.toLowerCase().includes(filterChemistry.toLowerCase());

    return matchesSearch && matchesChem;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'date') {
      const tA = new Date(a.startTimestamp).getTime();
      const tB = new Date(b.startTimestamp).getTime();
      return sortOrder === 'desc' ? tB - tA : tA - tB;
    }
    if (sortField === 'duration') {
      return sortOrder === 'desc'
        ? b.totalDurationSeconds - a.totalDurationSeconds
        : a.totalDurationSeconds - b.totalDurationSeconds;
    }
    if (sortField === 'energy') {
      const eA = a.readings[a.readings.length - 1]?.cumulativeEnergy || 0;
      const eB = b.readings[b.readings.length - 1]?.cumulativeEnergy || 0;
      return sortOrder === 'desc' ? eB - eA : eA - eB;
    }
    return 0;
  });

  const confirmDelete = () => {
    if (sessionToDelete) {
      onDeleteSession(sessionToDelete.sessionId);
      setSessionToDelete(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Historical Charging Sessions</h1>
          <p className="text-xs text-slate-500">
            Audit trail of recorded laboratory drone charging tests, raw samples, and diagnoses
          </p>
        </div>
        <div className="text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-xs">
          Total Sessions Logged: <span className="font-bold text-slate-900">{sessions.length}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="input-search-sessions"
              type="text"
              placeholder="Search by session ID, battery ID, operator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Filter by Chemistry */}
          <select
            id="select-filter-chemistry"
            value={filterChemistry}
            onChange={(e) => setFilterChemistry(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="all">All Chemistries</option>
            <option value="lipo">LiPo</option>
            <option value="li-ion">Li-Ion</option>
            <option value="lifepo4">LiFePO4</option>
          </select>

          {/* Sort Field */}
          <select
            id="select-sort-field"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as any)}
            className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="date">Sort by Date</option>
            <option value="duration">Sort by Duration</option>
            <option value="energy">Sort by Energy</option>
          </select>

          <button
            id="btn-toggle-sort-order"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="p-1.5 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
            title={`Order: ${sortOrder.toUpperCase()}`}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Session ID</th>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Battery</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Starting %</th>
                <th className="py-3 px-4">Ending %</th>
                <th className="py-3 px-4">Total Energy</th>
                <th className="py-3 px-4">Total mAh</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sorted.length > 0 ? (
                sorted.map((s) => {
                  const diag = s.diagnosis || generateSessionDiagnosis(s);
                  const lastReading = s.readings[s.readings.length - 1];
                  const firstReading = s.readings[0];

                  const startPct = firstReading?.batteryPercentage ?? 0;
                  const endPct = lastReading?.batteryPercentage ?? 0;
                  const totalWh = lastReading?.cumulativeEnergy ?? 0;
                  const totalMah = lastReading?.cumulativeMah ?? 0;

                  return (
                    <tr key={s.sessionId} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        <div className="flex items-center space-x-1.5">
                          <span>{s.sessionId}</span>
                          {s.isDemo && (
                            <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded">
                              Demo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {s.startTimestamp.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 block">{s.batteryId}</span>
                        <span className="text-[11px] text-slate-400 truncate block max-w-[160px]">
                          {s.batteryName}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {Math.floor(s.totalDurationSeconds / 60)}m {s.totalDurationSeconds % 60}s
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{startPct}%</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{endPct}%</td>
                      <td className="py-3 px-4 font-mono text-slate-800 font-medium">
                        {totalWh.toFixed(2)} Wh
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-800 font-medium">
                        {totalMah.toFixed(0)} mAh
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                          {s.sessionStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          id={`btn-open-session-${s.sessionId}`}
                          onClick={() => onOpenSession(s)}
                          title="Open in Diagnosis"
                          className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          id={`btn-export-session-${s.sessionId}`}
                          onClick={() => exportSessionToExcel(s)}
                          title="Download Excel Workbook"
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          id={`btn-delete-session-${s.sessionId}`}
                          onClick={() => setSessionToDelete(s)}
                          title="Delete Session"
                          className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No charging sessions matched your search filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">Delete Charging Session?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete session{' '}
                <span className="font-mono font-bold text-slate-800">{sessionToDelete.sessionId}</span>?
                This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-session"
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs"
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
