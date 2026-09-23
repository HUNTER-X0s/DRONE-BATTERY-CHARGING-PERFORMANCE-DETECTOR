export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing?: 'user' | 'environment' | 'unknown';
}

export interface CameraState {
  isActive: boolean;
  hasPermission: boolean | null;
  selectedDeviceId: string;
  availableCameras: CameraDeviceInfo[];
  errorMessage: string | null;
}

export class CameraManager {
  private mediaStream: MediaStream | null = null;
  private currentFacingMode: 'environment' | 'user' = 'environment';

  hasCameraSupport(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  async getAvailableCameras(): Promise<CameraDeviceInfo[]> {
    if (!this.hasCameraSupport() || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      return videoDevices.map((d, idx) => {
        const lowerLabel = (d.label || '').toLowerCase();
        let facing: 'user' | 'environment' | 'unknown' = 'unknown';
        if (lowerLabel.includes('back') || lowerLabel.includes('rear') || lowerLabel.includes('environment')) {
          facing = 'environment';
        } else if (lowerLabel.includes('front') || lowerLabel.includes('user') || lowerLabel.includes('face')) {
          facing = 'user';
        }

        return {
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1} (${facing !== 'unknown' ? facing : 'Input'})`,
          facing,
        };
      });
    } catch (e) {
      console.warn('Unable to enumerate video devices', e);
      return [];
    }
  }

  getCurrentStream(): MediaStream | null {
    return this.mediaStream;
  }

  getFacingMode(): 'environment' | 'user' {
    return this.currentFacingMode;
  }

  setFacingMode(mode: 'environment' | 'user') {
    this.currentFacingMode = mode;
  }

  async startCamera(
    videoElement: HTMLVideoElement,
    deviceId?: string,
    resolution: '640x480' | '1280x720' | '1920x1080' = '1280x720',
    preferredFacingMode: 'environment' | 'user' = this.currentFacingMode
  ): Promise<{ stream: MediaStream; success: boolean; error?: string }> {
    this.stopCamera(videoElement);
    this.currentFacingMode = preferredFacingMode;

    if (!this.hasCameraSupport()) {
      return {
        stream: null as any,
        success: false,
        error:
          'Camera API is not supported in this browser or environment. Please ensure you are accessing via HTTPS or localhost and camera permissions are enabled in your browser settings.',
      };
    }

    const [wStr, hStr] = resolution.split('x');
    const idealWidth = parseInt(wStr, 10) || 1280;
    const idealHeight = parseInt(hStr, 10) || 720;

    // Build hierarchical progressive constraints from most specific to universal fallback
    const constraintAttempts: MediaStreamConstraints[] = [];

    // Attempt 1: Target Device ID (if specified and non-empty)
    if (deviceId && deviceId.trim().length > 0) {
      constraintAttempts.push({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: idealWidth },
          height: { ideal: idealHeight },
        },
        audio: false,
      });
      constraintAttempts.push({
        video: {
          deviceId: { ideal: deviceId },
        },
        audio: false,
      });
    }

    // Attempt 2: Preferred facing mode (environment for bench meters / rear camera)
    constraintAttempts.push({
      video: {
        facingMode: { ideal: preferredFacingMode },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      },
      audio: false,
    });

    // Attempt 3: Any camera with ideal resolution
    constraintAttempts.push({
      video: {
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      },
      audio: false,
    });

    // Attempt 4: Standard VGA resolution
    constraintAttempts.push({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    // Attempt 5: Bare minimum video request (works on virtually any webcam / driver)
    constraintAttempts.push({
      video: true,
      audio: false,
    });

    let lastError: any = null;

    for (let i = 0; i < constraintAttempts.length; i++) {
      const constraints = constraintAttempts[i];
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.mediaStream = stream;

        // Configure video element for low-latency, cross-platform inline display
        videoElement.muted = true;
        videoElement.defaultMuted = true;
        videoElement.playsInline = true;
        videoElement.setAttribute('playsinline', 'true');
        videoElement.setAttribute('webkit-playsinline', 'true');
        videoElement.setAttribute('autoplay', 'true');
        videoElement.srcObject = stream;

        // Wait for video stream to actually produce frames
        await new Promise<void>((resolve) => {
          let resolved = false;

          const onReady = () => {
            if (!resolved) {
              resolved = true;
              videoElement.play().catch((playErr) => {
                console.warn('Video play caught:', playErr);
              });
              resolve();
            }
          };

          if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
            onReady();
            return;
          }

          videoElement.onloadedmetadata = onReady;
          videoElement.oncanplay = onReady;

          // Safety timeout in case events were already dispatched
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              videoElement.play().catch(() => {});
              resolve();
            }
          }, 450);
        });

        return { stream, success: true };
      } catch (err: any) {
        lastError = err;
        console.warn(`Camera constraint attempt #${i + 1} failed:`, constraints, err);
      }
    }

    // Translate browser errors into clear, actionable advice
    let friendlyError = 'Failed to access camera.';
    if (lastError) {
      if (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError') {
        friendlyError =
          'Camera permission was denied. Please click the lock or camera icon in your browser address bar to allow camera access for this application.';
      } else if (lastError.name === 'NotFoundError' || lastError.name === 'DevicesNotFoundError') {
        friendlyError =
          'No camera hardware detected on this device. Please connect a USB webcam or use the "Upload Meter Photo" feature.';
      } else if (lastError.name === 'NotReadableError' || lastError.name === 'TrackStartError') {
        friendlyError =
          'Camera is locked or currently in use by another application (e.g. Teams, Zoom, or another browser tab). Please close other camera apps and retry.';
      } else if (lastError.name === 'OverconstrainedError') {
        friendlyError = 'The requested resolution or camera device is not supported by your hardware.';
      } else if (lastError.name === 'SecurityError') {
        friendlyError =
          'Camera access blocked by iframe policy. Try opening the application in a new tab or granting permissions.';
      } else if (lastError.message) {
        friendlyError = lastError.message;
      }
    }

    return { stream: null as any, success: false, error: friendlyError };
  }

  stopCamera(videoElement?: HTMLVideoElement | null) {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            // ignore
          }
        });
      } catch (e) {
        console.warn('Error stopping stream tracks', e);
      }
      this.mediaStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  captureFrameToCanvas(
    videoElement: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ): boolean {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return false;
    }

    if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    try {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return true;
    } catch (e) {
      console.warn('Failed to draw video frame to canvas', e);
      return false;
    }
  }
}

export const cameraManager = new CameraManager();
