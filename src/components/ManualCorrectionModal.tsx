import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { RawOcrValue } from '../types/battery';

interface ManualCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawReading: {
    voltage: number;
    current: number;
    batteryPercentage: number;
    ocrConfidence: number;
    timestamp: string;
  };
  onApplyCorrection: (corrected: RawOcrValue, notes: string) => void;
}

export const ManualCorrectionModal: React.FC<ManualCorrectionModalProps> = ({
  isOpen,
  onClose,
  rawReading,
  onApplyCorrection,
}) => {
  const [v, setV] = useState(rawReading.voltage);
  const [i, setI] = useState(rawReading.current);
  const [pct, setPct] = useState(rawReading.batteryPercentage);
  const [notes, setNotes] = useState('Manual verification against physical display.');

  useEffect(() => {
    setV(rawReading.voltage);
    setI(rawReading.current);
    setPct(rawReading.batteryPercentage);
  }, [rawReading]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyCorrection(
      {
        voltage: Number(v),
        current: Number(i),
        batteryPercentage: Number(pct),
      },
      notes
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">Correct Reading</h2>
            <p className="text-xs text-slate-500">Preserves original OCR value &amp; saves verified record</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Raw Values Banner */}
          <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-xs">
            <p className="font-semibold text-slate-700 mb-1">Raw OCR Values (Read-Only Archive):</p>
            <div className="grid grid-cols-3 gap-2 font-mono text-slate-800">
              <div>V: {rawReading.voltage.toFixed(2)} V</div>
              <div>I: {rawReading.current.toFixed(2)} A</div>
              <div>SoC: {rawReading.batteryPercentage}%</div>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500">
              OCR Confidence: {rawReading.ocrConfidence}% • Time: {rawReading.timestamp.slice(11, 19)}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Verified Voltage (V)</label>
              <input
                id="input-correct-voltage"
                type="number"
                step="0.01"
                required
                value={v}
                onChange={(e) => setV(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Verified Current (A)</label>
              <input
                id="input-correct-current"
                type="number"
                step="0.01"
                required
                value={i}
                onChange={(e) => setI(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Verified Battery Percentage (%)</label>
              <input
                id="input-correct-percent"
                type="number"
                min="0"
                max="100"
                required
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Correction Reason / Note</label>
              <input
                id="input-correct-note"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md border border-slate-300"
              >
                Cancel
              </button>
              <button
                id="btn-apply-correction"
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition"
              >
                Save Corrected Value
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
