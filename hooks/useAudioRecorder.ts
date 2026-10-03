import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_RECORDING_MS = 120_000;

export type RecorderStatus = 'idle' | 'requesting' | 'recording';

export interface Recording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

// Safari records MP4/AAC, Chrome and Firefox record WebM or Ogg. Pick whatever this browser supports.
const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const pickMimeType = (): string | undefined =>
  typeof MediaRecorder === 'undefined' ? undefined : CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));

const explainError = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in your browser settings, or type your answer instead.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect one, or type your answer instead.';
  }
  if (name === 'NotReadableError') {
    return 'Your microphone is in use by another app. Close it and try again, or type your answer instead.';
  }
  return 'Recording did not work on this device. You can type your answer instead.';
};

export const isRecordingSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/**
 * Records microphone audio. `onComplete` receives the finished recording however it ended:
 * the user pressed stop, or the time limit was reached.
 */
export function useAudioRecorder(onComplete: (recording: Recording) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const release = useCallback(() => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!isRecordingSupported()) {
      setError('This browser cannot record audio. You can type your answer instead.');
      return false;
    }
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.round(performance.now() - startedAtRef.current);
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        release();
        setStatus('idle');
        onCompleteRef.current({ blob, durationMs, mimeType: type });
      };

      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setElapsedMs(0);
      recorder.start();
      setStatus('recording');
      timerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAtRef.current;
        setElapsedMs(Math.min(elapsed, MAX_RECORDING_MS));
        if (elapsed >= MAX_RECORDING_MS && recorder.state === 'recording') recorder.stop();
      }, 250);
      return true;
    } catch (err) {
      release();
      setStatus('idle');
      setError(explainError(err));
      return false;
    }
  }, [release]);

  // Never leave the microphone on if the user navigates away mid-recording.
  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    release();
  }, [release]);

  return { status, elapsedMs, error, start, stop, clearError: () => setError(null) };
}
