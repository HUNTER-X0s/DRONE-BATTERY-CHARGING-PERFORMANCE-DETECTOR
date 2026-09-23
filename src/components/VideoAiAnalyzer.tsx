import React, { useState, useRef } from 'react';
import {
  Video,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Gauge,
  BatteryCharging,
  FileSpreadsheet,
  Download,
  Plus,
  HelpCircle,
  Film,
  Send,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  AiVideoAnalysisResult,
  AiVideoFrameReading,
  ChargingSession,
  Reading,
  BatteryProfile,
} from '../types/battery';
import { aiService, VideoFrameSample } from '../services/aiService';
import { calculateReadingMetrics, calculateOnePercentTransitions } from '../calculations/batteryCalculations';
import { autodetectDisplayBoxes } from '../detection/meterDetection';
import { extractBoxValue } from '../ocr/meterOcr';

interface VideoAiAnalyzerProps {
  activeSession: ChargingSession | null;
  onImportReadings: (readings: Reading[], sessionMeta?: any) => void;
  onClose?: () => void;
}

const PRESET_DIRECTIVES = [
  'Extract full charging telemetry (V, I, SoC %) and calculate all 1% transition intervals.',
  'Identify peak charging current, CC-to-CV transition timestamp, and cutoff voltage.',
  'Analyze battery SoC progression and verify if current tapers properly according to ISO/IEC 62133.',
  'Detect any sudden voltage spikes, current dips, or signs of cell thermal throttling.',
];

export const VideoAiAnalyzer: React.FC<VideoAiAnalyzerProps> = ({
  activeSession,
  onImportReadings,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video playback state
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // AI Directive & Analysis state
  const [userDirective, setUserDirective] = useState(
    'Extract full charging telemetry (Voltage, Current, Battery %) across the video and identify 1% transitions.'
  );
  const [sampleCount, setSampleCount] = useState<number>(4);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AiVideoAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentFrameAiReading, setCurrentFrameAiReading] = useState<any | null>(null);
  const [isScanningCurrentFrame, setIsScanningCurrentFrame] = useState(false);

  // Handle Video File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoFileName(file.name);
    setAnalysisResult(null);
    setAnalysisError(null);
    setCurrentTime(0);
  };

  // Generate Synthetic Demonstration Video on Canvas (for instant testing without file upload)
  const handleLoadDemoVideo = () => {
    setAnalysisError(null);
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create a MediaStream from canvas and record a short 6-second webm clip
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVideoSrc(url);
      setVideoFileName('demo-charging-meters-bench.webm');
      setAnalysisResult(null);
    };

    recorder.start();

    // Render 180 frames (6 seconds at 30fps) simulating a CC to CV charging transition
    let frameIdx = 0;
    const totalFrames = 180;

    const drawInterval = setInterval(() => {
      if (frameIdx >= totalFrames) {
        clearInterval(drawInterval);
        recorder.stop();
        return;
      }

      const progress = frameIdx / totalFrames;
      const v = (14.8 + progress * 1.6).toFixed(2);
      const i = progress < 0.6 ? (4.95 - progress * 0.1).toFixed(2) : (4.95 - (progress - 0.6) * 7.5).toFixed(2);
      const pct = Math.min(100, Math.floor(20 + progress * 6));

      // Draw Bench Meter Frame
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);

      // Meter 1: Voltage
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.strokeRect(120, 140, 480, 380);
      ctx.fillRect(120, 140, 480, 380);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('TERMINAL VOLTAGE (METER 2)', 150, 190);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 96px monospace';
      ctx.fillText(`${v} V`, 160, 350);

      // Meter 2: Current
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 4;
      ctx.strokeRect(660, 110, 520, 230);
      ctx.fillRect(660, 110, 520, 230);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('CHARGE CURRENT (METER 1)', 690, 160);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 84px monospace';
      ctx.fillText(`${Math.max(0.1, parseFloat(i)).toFixed(2)} A`, 710, 260);

      // Meter 3: SoC %
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.strokeRect(660, 370, 520, 220);
      ctx.fillRect(660, 370, 520, 220);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('BATTERY STATE OF CHARGE', 690, 420);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 84px monospace';
      ctx.fillText(`${pct} %`, 710, 510);

      // Timestamp watermark
      ctx.fillStyle = '#64748b';
      ctx.font = '18px monospace';
      ctx.fillText(`BENCH RECORDING • TIME: ${(frameIdx / 30).toFixed(1)}s`, 120, 100);

      frameIdx++;
    }, 20);
  };

  // Video Time formatting
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Video playback controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const stepTime = (delta: number) => {
    if (!videoRef.current) return;
    const next = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta));
    videoRef.current.currentTime = next;
    setCurrentTime(next);
  };

  // Extract a single frame from video at its current position as a base64 Data URL
  const captureCurrentFrameDataUrl = (): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current || document.createElement('canvas');
    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / vWidth);
    canvas.width = Math.round(vWidth * scale);
    canvas.height = Math.round(vHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.80);
  };

  // Quick Single-Frame AI Scan
  const handleScanCurrentFrame = async () => {
    const frameData = captureCurrentFrameDataUrl();
    if (!frameData) {
      setAnalysisError('Could not capture frame from video.');
      return;
    }

    setIsScanningCurrentFrame(true);
    setAnalysisError(null);
    try {
      const res = await aiService.detectDisplay(frameData, activeSession ? {
        name: activeSession.batteryName,
        capacity: activeSession.batteryCapacity,
        chemistry: activeSession.batteryChemistry,
      } : undefined);
      setCurrentFrameAiReading(res);
    } catch (err: any) {
      console.error('Single frame scan failed:', err);
      setAnalysisError(err.message || 'Frame AI scan failed.');
    } finally {
      setIsScanningCurrentFrame(false);
    }
  };

  // Local Optical OCR Video Reader (100% Offline / Fallback when AI is under load)
  const handleAnalyzeLocalOcr = async () => {
    if (!videoRef.current || !duration || duration <= 0) {
      setAnalysisError('Please wait for the video to load before starting analysis.');
      return;
    }

    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress('Running Local Optical OCR frame extraction...');

    try {
      video.pause();
      setIsPlaying(false);

      const numFrames = Math.max(3, Math.min(16, sampleCount));
      const step = duration / (numFrames + 1);

      // Initial sample to detect display boxes
      video.currentTime = Math.min(duration, Math.max(0.5, step));
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const boxes = autodetectDisplayBoxes(canvas);

      const readings: AiVideoFrameReading[] = [];
      let peakCurrent = 0;
      let peakVoltage = 0;
      let initialSoC: number | null = null;
      let finalSoC: number | null = null;

      for (let i = 1; i <= numFrames; i++) {
        const targetSec = Number((step * i).toFixed(2));
        setAnalysisProgress(`Optical OCR processing frame ${i}/${numFrames} at ${formatTime(targetSec)}...`);

        video.currentTime = targetSec;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const vRes = extractBoxValue(canvas, boxes.voltage, 'voltage', 0, 60);
        const iRes = extractBoxValue(canvas, boxes.current, 'current', 0, 30);
        const pRes = extractBoxValue(canvas, boxes.batteryPercent, 'percent', 0, 100);

        const v = vRes.valid && vRes.value !== null ? vRes.value : null;
        const curr = iRes.valid && iRes.value !== null ? iRes.value : null;
        const pct = pRes.valid && pRes.value !== null ? pRes.value : null;

        if (curr !== null && curr > peakCurrent) peakCurrent = curr;
        if (v !== null && v > peakVoltage) peakVoltage = v;
        if (pct !== null) {
          if (initialSoC === null) initialSoC = pct;
          finalSoC = pct;
        }

        const phase = curr && curr > 0.5 ? 'Constant Current (CC)' : 'Constant Voltage (CV)';
        const power = v !== null && curr !== null ? Number((v * curr).toFixed(2)) : null;

        readings.push({
          timestampSec: targetSec,
          timestampFormatted: formatTime(targetSec),
          voltage: v,
          current: curr,
          batteryPercentage: pct,
          power,
          phase,
          notes: `Optical 7-Segment OCR @ ${formatTime(targetSec)}`,
        });
      }

      // Calculate transitions
      const transitions: any[] = [];
      for (let i = 1; i < readings.length; i++) {
        const prev = readings[i - 1];
        const curr = readings[i];
        if (
          prev.batteryPercentage !== null &&
          curr.batteryPercentage !== null &&
          curr.batteryPercentage > prev.batteryPercentage
        ) {
          transitions.push({
            fromPercent: prev.batteryPercentage,
            toPercent: curr.batteryPercentage,
            timestampFormatted: curr.timestampFormatted,
            elapsedSeconds: curr.timestampSec,
            durationSeconds: Number((curr.timestampSec - prev.timestampSec).toFixed(1)),
          });
        }
      }

      const result: AiVideoAnalysisResult = {
        summary: `Local Optical OCR decoded ${readings.length} video frames locally with zero cloud dependence. Peak Voltage: ${peakVoltage ? `${peakVoltage.toFixed(2)}V` : 'N/A'}, Peak Current: ${peakCurrent ? `${peakCurrent.toFixed(2)}A` : 'N/A'}.`,
        answerToUser: `Processed ${readings.length} video frames using high-speed optical 7-segment decoder. Detected ${transitions.length} SoC transitions.`,
        peakCurrent: peakCurrent > 0 ? peakCurrent : null,
        peakVoltage: peakVoltage > 0 ? peakVoltage : null,
        initialSoC,
        finalSoC,
        estimatedEnergyWh:
          peakVoltage && peakCurrent
            ? Number(((peakVoltage * peakCurrent * duration) / 3600).toFixed(2))
            : null,
        overallChargingPhase: peakCurrent > 0.5 ? 'Constant Current (CC)' : 'Constant Voltage (CV)',
        readings,
        transitions,
      };

      setAnalysisResult(result);
      setAnalysisProgress('');
    } catch (err: any) {
      console.error('Local Optical Analysis failed:', err);
      setAnalysisError(err.message || 'Local OCR processing failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Automated Multi-Frame Extraction & AI Video Reading
  const handleAnalyzeFullVideo = async () => {
    if (!videoRef.current || !duration || duration <= 0) {
      setAnalysisError('Please wait for the video to load before starting AI analysis.');
      return;
    }

    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current || document.createElement('canvas');
    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / vWidth);
    canvas.width = Math.round(vWidth * scale);
    canvas.height = Math.round(vHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress('Preparing video sampling...');

    try {
      // Pause video while sampling
      video.pause();
      setIsPlaying(false);

      const framesToSample: VideoFrameSample[] = [];
      const numFrames = Math.max(3, Math.min(16, sampleCount));
      const step = duration / (numFrames + 1);

      for (let i = 1; i <= numFrames; i++) {
        const targetSec = Number((step * i).toFixed(2));
        setAnalysisProgress(`Extracting optical frame ${i}/${numFrames} at ${formatTime(targetSec)}...`);

        // Seek video to target timestamp
        video.currentTime = targetSec;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });

        // Allow frame to render to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

        framesToSample.push({
          timestampSec: targetSec,
          timestampFormatted: formatTime(targetSec),
          image: dataUrl,
        });
      }

      setAnalysisProgress(`Sending ${framesToSample.length} frames to Gemini 3.8 Flash AI...`);

      const result = await aiService.analyzeVideo(
        framesToSample,
        userDirective,
        activeSession
          ? {
            name: activeSession.batteryName,
            capacity: activeSession.batteryCapacity,
            chemistry: activeSession.batteryChemistry,
          }
          : undefined
      );

      setAnalysisResult(result);
      setAnalysisProgress('');
    } catch (err: any) {
      console.error('Video AI Analysis failed:', err);
      setAnalysisError(err.message || 'AI Video Analysis failed. Please verify network or key.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Convert AI Video Readings into Application Reading items and import
  const handleImportToSession = () => {
    if (!analysisResult || !analysisResult.readings || analysisResult.readings.length === 0) {
      alert('No valid readings extracted from video to import.');
      return;
    }

    const baseStartMs = activeSession
      ? new Date(activeSession.startTimestamp).getTime()
      : Date.now();

    const formattedReadings: Reading[] = [];
    let prevReading: Reading | undefined = undefined;

    let importedCount = 0;
    let skippedCount = 0;

    analysisResult.readings.forEach((r, idx) => {
      const allPresent =
        typeof r.voltage === 'number' && !Number.isNaN(r.voltage) &&
        typeof r.current === 'number' && !Number.isNaN(r.current) &&
        typeof r.batteryPercentage === 'number' && !Number.isNaN(r.batteryPercentage);

      if (!allPresent) {
        skippedCount++;
        return;
      }

      const v = r.voltage;
      const i = r.current;
      const p = r.batteryPercentage;
      const sampleTimeMs = baseStartMs + r.timestampSec * 1000;

      const reading = calculateReadingMetrics(
        sampleTimeMs,
        baseStartMs,
        v,
        i,
        p,
        prevReading,
        95,
        'AI_Vision',
        'Verified',
        r.notes || `AI Video Sample @ ${r.timestampFormatted}`
      );
      if (activeSession) {
        reading.sessionId = activeSession.sessionId;
      }
      formattedReadings.push(reading);
      prevReading = reading;
      importedCount++;
    });

    onImportReadings(formattedReadings, {
      sourceVideo: videoFileName,
      aiSummary: analysisResult.summary,
      peakCurrent: analysisResult.peakCurrent,
      peakVoltage: analysisResult.peakVoltage,
    });

    if (skippedCount > 0) {
      alert(
        `Imported ${importedCount} of ${analysisResult.readings.length} AI video frames.\n` +
        `Skipped ${skippedCount} frames with missing/invalid V/I/SoC values.\n` +
        `Integrity notice: No synthetic defaults were inserted.`
      );
    } else {
      alert(`Successfully imported ${importedCount} readings into the charging session!`);
    }
  };

  // Export Table to CSV
  const handleExportCsv = () => {
    if (!analysisResult?.readings) return;
    const headers = ['Timestamp (s)', 'Time (mm:ss)', 'Voltage (V)', 'Current (A)', 'SoC (%)', 'Power (W)', 'Phase', 'AI Notes'];
    const rows = analysisResult.readings.map((r) => [
      r.timestampSec,
      r.timestampFormatted,
      r.voltage ?? '',
      r.current ?? '',
      r.batteryPercentage ?? '',
      r.power ?? '',
      `"${r.phase || ''}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ai_video_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-6">
      {/* Hidden inputs & canvas */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="video/*"
        className="hidden"
      />
      <canvas ref={hiddenCanvasRef} className="hidden" />

      {/* Header with Title and Mode Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              AI Video Telemetry Reader
            </h2>
            <p className="text-xs text-slate-500">
              Upload pre-recorded meter videos or inspect charging bench footage using Gemini 3.8 Flash AI
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold shadow-xs transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Video File</span>
          </button>

          <button
            onClick={handleLoadDemoVideo}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium border border-slate-300 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Load Demo Video</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 text-slate-400 hover:text-slate-600 rounded text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error Notice if any */}
      {analysisError && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-950 shadow-xs">
          <div className="flex items-start space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-900 text-sm">AI Video Processing Notice</p>
              <p className="text-amber-800 leading-relaxed">{analysisError}</p>
              <p className="text-[11px] text-amber-700">
                💡 Tip: Spikes in cloud AI demand are temporary. You can retry with fewer keyframes, or switch to the 100% offline Local Optical OCR.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={handleAnalyzeFullVideo}
              disabled={isAnalyzing}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>Retry AI Analysis</span>
            </button>
            <button
              onClick={handleAnalyzeLocalOcr}
              disabled={isAnalyzing || !videoSrc}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Run Local Optical OCR</span>
            </button>
          </div>
        </div>
      )}

      {/* Video Viewport & Playback Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Video Player */}
        <div className="lg:col-span-7 space-y-3">
          <div className="relative aspect-16/9 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-900 text-indigo-400 flex items-center justify-center border border-slate-800">
                  <Video className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">No Video Loaded</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Upload an MP4, WebM, or MOV recording of your bench meters, or click "Load Demo Video" to test the AI video reader.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                  >
                    Select Video File
                  </button>
                  <button
                    onClick={handleLoadDemoVideo}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs"
                  >
                    Load Demo Video
                  </button>
                </div>
              </div>
            )}

            {/* Overlaid Badge if Video Loaded */}
            {videoFileName && (
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded font-mono border border-white/10 flex items-center space-x-1.5">
                <Film className="w-3 h-3 text-indigo-400" />
                <span className="truncate max-w-[200px]">{videoFileName}</span>
              </div>
            )}
          </div>

          {/* Player Transport Bar */}
          {videoSrc && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center space-x-3">
                <button
                  onClick={togglePlay}
                  className="w-8 h-8 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition shadow-xs"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  onClick={() => stepTime(-1)}
                  title="Step -1s"
                  className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-xs font-mono text-slate-700"
                >
                  -1s
                </button>
                <button
                  onClick={() => stepTime(1)}
                  title="Step +1s"
                  className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-xs font-mono text-slate-700"
                >
                  +1s
                </button>

                {/* Scrubber */}
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />

                <div className="font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                <button
                  onClick={handleScanCurrentFrame}
                  disabled={isScanningCurrentFrame}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded text-xs font-semibold shadow-xs"
                  title="Read digital meters at this exact paused frame"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isScanningCurrentFrame ? 'Reading...' : 'Scan Frame'}</span>
                </button>
              </div>

              {/* Instant Frame Scan Result if present */}
              {currentFrameAiReading && (
                <div className="mt-2 p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-md text-xs text-indigo-950 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="font-bold">Frame @ {formatTime(currentTime)}:</span>
                    <span className="font-mono font-bold text-blue-700">
                      {currentFrameAiReading.voltage !== null ? `${currentFrameAiReading.voltage} V` : '--'}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {currentFrameAiReading.current !== null ? `${currentFrameAiReading.current} A` : '--'}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="font-mono font-bold text-amber-700">
                      {currentFrameAiReading.batteryPercentage !== null ? `${currentFrameAiReading.batteryPercentage}%` : '--'}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-indigo-800 text-[11px]">{currentFrameAiReading.chargingPhase}</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 bg-white px-2 py-0.5 rounded font-mono border border-indigo-200">
                    Confidence: {currentFrameAiReading.confidence}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 5 cols: AI Metrology Directive & Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>AI Metrology Directive</span>
              </label>
              <span className="text-[11px] text-slate-500">Direct AI to extract what you need</span>
            </div>

            <textarea
              rows={3}
              value={userDirective}
              onChange={(e) => setUserDirective(e.target.value)}
              placeholder="e.g. Extract full charging telemetry series, calculate 1% transitions, and identify when current tapers..."
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />

            {/* Quick Directive Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-slate-600 block">Quick Directives:</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_DIRECTIVES.map((directive, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setUserDirective(directive)}
                    className="text-[11px] px-2 py-1 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 rounded text-left transition"
                  >
                    {directive.slice(0, 48)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Sample Rate Selector */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
              <span className="text-slate-600 font-medium">Frames to Sample:</span>
              <select
                value={sampleCount}
                onChange={(e) => setSampleCount(parseInt(e.target.value, 10))}
                className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800"
              >
                <option value={4}>4 Keyframes (Fast scan)</option>
                <option value={8}>8 Keyframes (Standard sample)</option>
                <option value={12}>12 Keyframes (High precision)</option>
                <option value={16}>16 Keyframes (Detailed curve)</option>
              </select>
            </div>

            {/* Trigger Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleAnalyzeFullVideo}
                disabled={isAnalyzing || !videoSrc}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing Video...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Read Video with AI (Gemini 3.8 Flash)</span>
                  </>
                )}
              </button>

              <button
                onClick={handleAnalyzeLocalOcr}
                disabled={isAnalyzing || !videoSrc}
                className="w-full py-2 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                title="Process frames locally using high-speed optical 7-segment OCR (Zero network required)"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>⚡ Read Video with Local Optical OCR (Offline)</span>
              </button>
            </div>

            {/* Progress Message */}
            {isAnalyzing && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-800 flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span className="font-mono text-[11px]">{analysisProgress}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI ANALYSIS RESULTS SECTION */}
      {analysisResult && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs space-y-4 p-4 sm:p-5">
          {/* Top Result Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                AI Video Metrology Findings &amp; Directive Response
              </h3>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleImportToSession}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Import to Charging Session</span>
              </button>

              <button
                onClick={handleExportCsv}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* AI Answer & Summary Box */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-900">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Response as Directed:</span>
            </div>
            <p className="text-xs text-slate-800 leading-relaxed font-sans">
              {analysisResult.answerToUser || analysisResult.summary}
            </p>
          </div>

          {/* Key Milestone Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 block">SoC Progression</span>
              <span className="text-lg font-bold font-mono text-slate-900">
                {analysisResult.initialSoC ?? '--'}% → {analysisResult.finalSoC ?? '--'}%
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 block">Peak Current</span>
              <span className="text-lg font-bold font-mono text-emerald-700">
                {analysisResult.peakCurrent !== null ? `${analysisResult.peakCurrent.toFixed(2)} A` : '--'}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 block">Peak / Cutoff Voltage</span>
              <span className="text-lg font-bold font-mono text-blue-700">
                {analysisResult.peakVoltage !== null ? `${analysisResult.peakVoltage.toFixed(2)} V` : '--'}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 block">Estimated Energy</span>
              <span className="text-lg font-bold font-mono text-amber-700">
                {analysisResult.estimatedEnergyWh !== null ? `${analysisResult.estimatedEnergyWh.toFixed(2)} Wh` : '--'}
              </span>
            </div>
          </div>

          {/* Chronological Extracted Readings Table */}
          {analysisResult.readings && analysisResult.readings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Extracted Chronological Telemetry Series ({analysisResult.readings.length} Samples)
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Voltage (V)</th>
                      <th className="py-2 px-3">Current (A)</th>
                      <th className="py-2 px-3">Battery SoC</th>
                      <th className="py-2 px-3">Power (W)</th>
                      <th className="py-2 px-3">Charging Phase</th>
                      <th className="py-2 px-3">AI Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {analysisResult.readings.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-900">{r.timestampFormatted}</td>
                        <td className="py-2 px-3 font-bold text-blue-700">{r.voltage?.toFixed(2) ?? '--'} V</td>
                        <td className="py-2 px-3 font-bold text-emerald-700">{r.current?.toFixed(2) ?? '--'} A</td>
                        <td className="py-2 px-3 font-bold text-amber-700">{r.batteryPercentage ?? '--'} %</td>
                        <td className="py-2 px-3 text-slate-700">{r.power?.toFixed(1) ?? '--'} W</td>
                        <td className="py-2 px-3 font-sans text-slate-800 text-[11px]">{r.phase || '--'}</td>
                        <td className="py-2 px-3 font-sans text-slate-600 text-[11px]">{r.notes || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 1% Transitions Table if detected */}
          {analysisResult.transitions && analysisResult.transitions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Detected 1% Battery Transitions ({analysisResult.transitions.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {analysisResult.transitions.map((t, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>{t.fromPercent}% → {t.toPercent}%</span>
                      <span className="text-blue-700 font-mono">{t.durationSeconds}s</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      at {t.timestampFormatted} ({t.elapsedSeconds}s elapsed)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
