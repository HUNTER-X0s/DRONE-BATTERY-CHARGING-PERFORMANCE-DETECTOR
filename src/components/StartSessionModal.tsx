import React, { useState } from 'react';
import { X, Battery, Zap, User, ShieldCheck } from 'lucide-react';
import { BatteryProfile } from '../types/battery';
import { storageService } from '../storage/storageService';

interface StartSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (sessionInfo: {
    batteryId: string;
    batteryName: string;
    batteryCapacity: number;
    batteryChemistry: string;
    chargerName: string;
    operatorName: string;
    notes?: string;
  }) => void;
  isDemo: boolean;
}

export const StartSessionModal: React.FC<StartSessionModalProps> = ({
  isOpen,
  onClose,
  onStart,
  isDemo,
}) => {
  const batteries = storageService.getBatteries();

  const [selectedBatteryId, setSelectedBatteryId] = useState<string>(batteries[0]?.batteryId || 'BAT-4S-5000');
  const [batteryName, setBatteryName] = useState<string>(batteries[0]?.batteryName || 'Tattu R-Line 4S 5000mAh 120C');
  const [batteryCapacity, setBatteryCapacity] = useState<number>(batteries[0]?.capacity || 5000);
  const [batteryChemistry, setBatteryChemistry] = useState<string>(batteries[0]?.batteryChemistry || 'LiPo (Lithium Polymer)');
  const [chargerName, setChargerName] = useState<string>('ISDT Q6 Nano Smart Charger');
  const [operatorName, setOperatorName] = useState<string>('Lab Test Engineer');
  const [notes, setNotes] = useState<string>('Standard 1C constant-current / constant-voltage performance profile.');

  if (!isOpen) return null;

  const handleSelectPreset = (bId: string) => {
    const found = batteries.find((b) => b.batteryId === bId);
    if (found) {
      setSelectedBatteryId(found.batteryId);
      setBatteryName(found.batteryName);
      setBatteryCapacity(found.capacity);
      setBatteryChemistry(found.batteryChemistry);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart({
      batteryId: selectedBatteryId,
      batteryName,
      batteryCapacity,
      batteryChemistry,
      chargerName,
      operatorName,
      notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Start Charging Session</h2>
            <p className="text-xs text-slate-500">Configure battery, charger, and operator details</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Demo Mode notification */}
        {isDemo && (
          <div className="bg-amber-50 px-6 py-2.5 border-b border-amber-200 flex items-center space-x-2 text-xs text-amber-800">
            <span className="font-semibold uppercase tracking-wider bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">
              DEMO MODE
            </span>
            <span>Realistic simulated physical readings will be recorded for evaluation.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Preset selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Select Battery Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              {batteries.map((b) => (
                <button
                  type="button"
                  key={b.batteryId}
                  onClick={() => handleSelectPreset(b.batteryId)}
                  className={`p-2.5 text-left border rounded-lg transition text-xs ${
                    selectedBatteryId === b.batteryId
                      ? 'border-blue-500 bg-blue-50/50 text-blue-900 ring-1 ring-blue-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-semibold truncate">{b.batteryId}</p>
                  <p className="text-[11px] text-slate-500 truncate">{b.capacity}mAh • {b.numberOfCells}S</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Battery ID</label>
              <input
                id="input-battery-id"
                type="text"
                required
                value={selectedBatteryId}
                onChange={(e) => setSelectedBatteryId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Capacity (mAh)</label>
              <input
                id="input-battery-capacity"
                type="number"
                required
                min="100"
                max="50000"
                value={batteryCapacity}
                onChange={(e) => setBatteryCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Battery Name</label>
              <input
                id="input-battery-name"
                type="text"
                required
                value={batteryName}
                onChange={(e) => setBatteryName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Chemistry</label>
              <select
                id="select-battery-chemistry"
                value={batteryChemistry}
                onChange={(e) => setBatteryChemistry(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="LiPo (Lithium Polymer)">LiPo (Lithium Polymer)</option>
                <option value="Li-Ion (Lithium Ion)">Li-Ion (Lithium Ion)</option>
                <option value="LiFePO4 (Lithium Iron Phosphate)">LiFePO4 (Lithium Iron Phosphate)</option>
                <option value="LiHV (High Voltage LiPo)">LiHV (High Voltage LiPo)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Charger Name</label>
              <input
                id="input-charger-name"
                type="text"
                required
                value={chargerName}
                onChange={(e) => setChargerName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Operator Name</label>
              <input
                id="input-operator-name"
                type="text"
                required
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes (Optional)</label>
            <textarea
              id="input-session-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Test conditions, ambient temperature, charge rate..."
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
              id="btn-confirm-start-session"
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition"
            >
              Begin Session Recording
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
