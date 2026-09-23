import React, { useState, useEffect } from 'react';
import { Navbar, ActivePage } from './components/Navbar';
import { ChargingMonitorPage } from './pages/ChargingMonitorPage';
import { DiagnosisPage } from './pages/DiagnosisPage';
import { ReportsPage } from './pages/ReportsPage';
import { SessionHistoryPage } from './pages/SessionHistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { CalibrationModal } from './components/CalibrationModal';
import { ChargingSession, Reading, AppSettings } from './types/battery';
import { storageService } from './storage/storageService';
import { calculateOnePercentTransitions, generateSessionDiagnosis } from './calculations/batteryCalculations';

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<ActivePage>('monitor');
  const [settings, setSettings] = useState<AppSettings>(storageService.getSettings());
  const [sessions, setSessions] = useState<ChargingSession[]>(storageService.getSessions());
  const [activeSession, setActiveSession] = useState<ChargingSession | null>(null);
  const [selectedDiagnosisSession, setSelectedDiagnosisSession] = useState<ChargingSession | null>(
    sessions.length > 0 ? sessions[0] : null
  );
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);

  // Sync settings updates
  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    storageService.saveSettings(newSettings);
  };

  // Start Session Handler
  const handleStartSession = (sessionInfo: {
    batteryId: string;
    batteryName: string;
    batteryCapacity: number;
    batteryChemistry: string;
    chargerName: string;
    operatorName: string;
    notes?: string;
  }) => {
    const startMs = Date.now();
    const sessionId = `SES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    const newSession: ChargingSession = {
      sessionId,
      batteryId: sessionInfo.batteryId,
      batteryName: sessionInfo.batteryName,
      batteryCapacity: sessionInfo.batteryCapacity,
      batteryChemistry: sessionInfo.batteryChemistry,
      chargerName: sessionInfo.chargerName,
      operatorName: sessionInfo.operatorName,
      notes: sessionInfo.notes,
      startTimestamp: new Date(startMs).toISOString(),
      sessionStatus: 'recording',
      isDemo: settings.demoMode,
      totalDurationSeconds: 0,
      readings: [],
      transitions: [],
    };

    setActiveSession(newSession);
    setSelectedDiagnosisSession(newSession);
  };

  // Pause Session
  const handlePauseSession = () => {
    if (!activeSession) return;
    setActiveSession({
      ...activeSession,
      sessionStatus: 'paused',
    });
  };

  // Resume Session
  const handleResumeSession = () => {
    if (!activeSession) return;
    setActiveSession({
      ...activeSession,
      sessionStatus: 'recording',
    });
  };

  // Stop Session
  const handleStopSession = () => {
    if (!activeSession) return;

    const endMs = Date.now();
    const startMs = new Date(activeSession.startTimestamp).getTime();
    const totalSec = Math.max(1, Math.round((endMs - startMs) / 1000));
    const transitions = calculateOnePercentTransitions(activeSession.readings);

    const finalizedSession: ChargingSession = {
      ...activeSession,
      sessionStatus: 'completed',
      endTimestamp: new Date(endMs).toISOString(),
      totalDurationSeconds: totalSec,
      transitions,
    };

    finalizedSession.diagnosis = generateSessionDiagnosis(finalizedSession);

    // Persist to storage
    storageService.saveSession(finalizedSession);
    setSessions(storageService.getSessions());
    setActiveSession(null);
    setSelectedDiagnosisSession(finalizedSession);
    setActivePage('diagnosis');
  };

  // Handle New Real-time Reading
  const handleNewReading = (reading: Reading) => {
    if (!activeSession) return;

    setActiveSession((prev) => {
      if (!prev) return null;
      const updatedReadings = [...prev.readings, reading];
      const startMs = new Date(prev.startTimestamp).getTime();
      const durationSec = Math.max(0, Math.round((reading.timestampMs - startMs) / 1000));
      const transitions = calculateOnePercentTransitions(updatedReadings);

      return {
        ...prev,
        totalDurationSeconds: durationSec,
        readings: updatedReadings,
        transitions,
      };
    });
  };

  // Handle Update to Latest Reading (Manual correction / verification)
  const handleUpdateLatestReading = (updatedReading: Reading) => {
    if (!activeSession) return;

    setActiveSession((prev) => {
      if (!prev || prev.readings.length === 0) return prev;
      const copy = [...prev.readings];
      copy[copy.length - 1] = updatedReading;
      const transitions = calculateOnePercentTransitions(copy);
      return {
        ...prev,
        readings: copy,
        transitions,
      };
    });
  };

  // Handle Import of Batch Readings (e.g. from Video AI analysis)
  const handleImportVideoReadings = (newReadings: Reading[], meta?: any) => {
    if (newReadings.length === 0) return;

    if (activeSession) {
      setActiveSession((prev) => {
        if (!prev) return null;
        const combined = [...prev.readings, ...newReadings];
        combined.sort((a, b) => a.timestampMs - b.timestampMs);
        const startMs = new Date(prev.startTimestamp).getTime();
        const lastReading = combined[combined.length - 1];
        const durationSec = lastReading
          ? Math.max(0, Math.round((lastReading.timestampMs - startMs) / 1000))
          : prev.totalDurationSeconds;
        const transitions = calculateOnePercentTransitions(combined);
        return {
          ...prev,
          totalDurationSeconds: durationSec,
          readings: combined,
          transitions,
        };
      });
    } else {
      // Automatically construct a completed charging session from the analyzed video
      const startMs = newReadings[0]?.timestampMs || Date.now();
      const lastReading = newReadings[newReadings.length - 1];
      const endMs = lastReading?.timestampMs || startMs + 60000;
      const totalSec = Math.max(1, Math.round((endMs - startMs) / 1000));
      const transitions = calculateOnePercentTransitions(newReadings);
      const sessionId = `SES-VID-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
        100 + Math.random() * 900
      )}`;

      const newSession: ChargingSession = {
        sessionId,
        batteryId: 'BAT-VID-001',
        batteryName: meta?.sourceVideo ? `Video: ${meta.sourceVideo}` : 'AI Video Charging Analysis',
        batteryCapacity: 5000,
        batteryChemistry: 'LiPo (4S)',
        chargerName: 'AI Video Telemetry Reader',
        operatorName: 'AI Metrology Analyst',
        notes: meta?.aiSummary || 'Generated from AI Video Telemetry Analysis',
        startTimestamp: new Date(startMs).toISOString(),
        endTimestamp: new Date(endMs).toISOString(),
        sessionStatus: 'completed',
        isDemo: settings.demoMode,
        totalDurationSeconds: totalSec,
        readings: newReadings,
        transitions,
      };

      newSession.diagnosis = generateSessionDiagnosis(newSession);
      storageService.saveSession(newSession);
      setSessions(storageService.getSessions());
      setSelectedDiagnosisSession(newSession);
      setActivePage('diagnosis');
    }
  };

  // Open Session in Diagnosis View
  const handleOpenSession = (session: ChargingSession) => {
    setSelectedDiagnosisSession(session);
    setActivePage('diagnosis');
  };

  // Delete Session
  const handleDeleteSession = (sessionId: string) => {
    storageService.deleteSession(sessionId);
    const updated = storageService.getSessions();
    setSessions(updated);
    if (selectedDiagnosisSession?.sessionId === sessionId) {
      setSelectedDiagnosisSession(updated[0] || null);
    }
  };

  // Elapsed Seconds Counter
  const elapsedSeconds = activeSession ? activeSession.totalDurationSeconds : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Laboratory Standard Navigation Bar */}
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        sessionStatus={activeSession ? activeSession.sessionStatus : 'idle'}
        elapsedSeconds={elapsedSeconds}
        isDemo={settings.demoMode}
        onPauseSession={handlePauseSession}
        onResumeSession={handleResumeSession}
        onStopSession={handleStopSession}
      />

      {/* Main Content View Switcher */}
      <main className="flex-1 pb-12">
        {activePage === 'monitor' && (
          <ChargingMonitorPage
            settings={settings}
            activeSession={activeSession}
            onStartSession={handleStartSession}
            onPauseSession={handlePauseSession}
            onResumeSession={handleResumeSession}
            onStopSession={handleStopSession}
            onNewReading={handleNewReading}
            onUpdateLatestReading={handleUpdateLatestReading}
            onImportVideoReadings={handleImportVideoReadings}
            onOpenCalibration={() => setIsCalibrationOpen(true)}
            onOpenDiagnosis={(ses) => {
              setSelectedDiagnosisSession(ses);
              setActivePage('diagnosis');
            }}
          />
        )}

        {activePage === 'diagnosis' && (
          <DiagnosisPage
            session={selectedDiagnosisSession}
            onNavigateToReports={() => setActivePage('reports')}
          />
        )}

        {activePage === 'reports' && (
          <ReportsPage
            sessions={sessions}
            onStartNewSession={() => {
              setActivePage('monitor');
            }}
          />
        )}

        {activePage === 'history' && (
          <SessionHistoryPage
            sessions={sessions}
            onOpenSession={handleOpenSession}
            onDeleteSession={handleDeleteSession}
          />
        )}

        {activePage === 'settings' && (
          <SettingsPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onOpenCalibration={() => setIsCalibrationOpen(true)}
          />
        )}
      </main>

      {/* Calibration Modal */}
      <CalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        settings={settings}
        onSaveSettings={handleUpdateSettings}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>Battery Charging Performance &amp; Diagnosis System • Laboratory Grade Instrumentation</span>
          <span className="font-mono text-slate-400 text-[11px]">
            ISO/IEC 62133 Standard Compliant Reference Model
          </span>
        </div>
      </footer>
    </div>
  );
};
