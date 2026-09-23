import { AiDisplayDetectionResult, AiVideoAnalysisResult, MeterBoundingBox } from '../types/battery';

export interface BatteryInfoParam {
  name: string;
  capacity: number;
  chemistry: string;
}

export interface VideoFrameSample {
  timestampSec: number;
  timestampFormatted: string;
  image: string; // base64 data url
}

export interface CalibratedBoxes {
  voltage: MeterBoundingBox;
  current: MeterBoundingBox;
  batteryPercent: MeterBoundingBox;
}

export const aiService = {
  /**
   * Check backend health and AI API key availability
   */
  async checkHealth(): Promise<{ status: string; aiConfigured: boolean }> {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Health check failed');
      return await res.json();
    } catch {
      return { status: 'offline', aiConfigured: false };
    }
  },

  /**
   * Auto-detect display directly from a camera frame using Gemini 3.8 Flash
   */
  async detectDisplay(
    imageDataUrl: string,
    batteryInfo?: BatteryInfoParam,
    calibratedBoxes?: CalibratedBoxes
  ): Promise<AiDisplayDetectionResult> {
    try {
      const res = await fetch('/api/ai/detect-display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageDataUrl,
          batteryInfo,
          calibratedBoxes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || 'Invalid AI response');
      }

      return json.data as AiDisplayDetectionResult;
    } catch (err: any) {
      console.warn('AI detectDisplay fallback due to error:', err);
      return {
        detected: false,
        voltage: null,
        current: null,
        batteryPercentage: null,
        power: null,
        chargingPhase: 'Unreachable',
        confidence: 0,
        readoutText: `AI detection unavailable: ${err.message || 'Check server connection'}`,
        metersFound: [],
      };
    }
  },

  /**
   * Read and analyze video frames with AI as directed
   */
  async analyzeVideo(
    frames: VideoFrameSample[],
    userDirective: string,
    batteryInfo?: BatteryInfoParam
  ): Promise<AiVideoAnalysisResult> {
    const res = await fetch('/api/ai/analyze-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frames,
        userDirective,
        batteryInfo,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Video analysis server error: ${res.status}`);
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.error || 'Invalid response from AI video service');
    }

    return json.data as AiVideoAnalysisResult;
  },
};
