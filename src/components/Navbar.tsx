import React from 'react';
import { Activity, FileText, History, Settings, CheckCircle2, AlertTriangle, Play, Pause, Square } from 'lucide-react';
import { SessionStatus } from '../types/battery';

export type ActivePage = 'monitor' | 'diagnosis' | 'reports' | 'history' | 'settings';

interface NavbarProps {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  sessionStatus: SessionStatus;
  elapsedSeconds: number;
  isDemo: boolean;
  onPauseSession?: () => void;
  onResumeSession?: () => void;
  onStopSession?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePage,
  setActivePage,
  sessionStatus,
  elapsedSeconds,
  isDemo,
  onPauseSession,
  onResumeSession,
  onStopSession,
}) => {
  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const navItems: { id: ActivePage; label: string; icon: React.ReactNode }[] = [
    { id: 'monitor', label: 'Charging Monitor', icon: <Activity className="w-4 h-4" /> },
    { id: 'diagnosis', label: 'Diagnosis', icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <FileText className="w-4 h-4" /> },
    { id: 'history', label: 'Session History', icon: <History className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Brand & Identity */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-xs">
            BP
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-900 text-base leading-tight tracking-tight">
                Battery Performance &amp; Diagnosis
              </span>
              {isDemo && (
                <span
                  id="navbar-demo-badge"
                  className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-amber-100 text-amber-800 border border-amber-300"
                >
                  DEMO MODE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Session Status Pill */}
        <div className="flex items-center space-x-3">
          {sessionStatus === 'recording' && (
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-800 font-mono">
                REC {formatTime(elapsedSeconds)}
              </span>
              {onPauseSession && (
                <button
                  onClick={onPauseSession}
                  title="Pause recording"
                  className="p-1 text-emerald-700 hover:text-emerald-950 rounded hover:bg-emerald-100"
                >
                  <Pause className="w-3.5 h-3.5" />
                </button>
              )}
              {onStopSession && (
                <button
                  onClick={onStopSession}
                  title="Stop session"
                  className="p-1 text-red-600 hover:text-red-800 rounded hover:bg-red-50"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {sessionStatus === 'paused' && (
            <div className="flex items-center space-x-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-amber-800 font-mono">
                PAUSED {formatTime(elapsedSeconds)}
              </span>
              {onResumeSession && (
                <button
                  onClick={onResumeSession}
                  title="Resume recording"
                  className="p-1 text-amber-700 hover:text-amber-950 rounded hover:bg-amber-100"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              )}
              {onStopSession && (
                <button
                  onClick={onStopSession}
                  title="Stop session"
                  className="p-1 text-red-600 hover:text-red-800 rounded hover:bg-red-50"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {sessionStatus === 'idle' && (
            <div className="hidden md:flex items-center space-x-1 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Standby</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
