import React, { useState } from 'react';
import { MAX_RECORDING_MS, isRecordingSupported, useAudioRecorder, type Recording } from '../hooks/useAudioRecorder';
import { transcribeRecording } from '../services/voice';
import type { DeliveryStats } from '../types';
import { MicIcon, SpinnerIcon, StopIcon } from './Icons';

interface VoiceRecorderProps {
  onResult: (transcript: string, delivery: DeliveryStats) => void;
  disabled?: boolean;
}

const formatTime = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onResult, disabled }) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const supported = isRecordingSupported();

  const handleRecording = async (recording: Recording) => {
    setIsTranscribing(true);
    setAnnouncement('Recording stopped. Transcribing your answer.');
    try {
      const { transcript, delivery } = await transcribeRecording(recording.blob, recording.durationMs, recording.mimeType);
      setAnnouncement('Transcript ready. Review it, fix any mistakes, then submit.');
      onResult(transcript, delivery);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not transcribe your answer.';
      setTranscribeError(message);
      setAnnouncement(message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const { status, elapsedMs, error, start, stop } = useAudioRecorder(handleRecording);

  const begin = async () => {
    setTranscribeError(null);
    const started = await start();
    if (started) setAnnouncement('Recording started.');
  };

  const shownError = error || transcribeError;

  if (!supported) {
    return <p className="text-sm text-text-muted">Voice answers are not available in this browser. You can type your answer instead.</p>;
  }

  return (
    <div className="rounded-lg border border-background-light bg-background-dark/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        {status === 'recording' ? (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-2 py-2.5 px-5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-white transition-colors"
          >
            <StopIcon className="w-5 h-5" /> Stop recording
          </button>
        ) : (
          <button
            type="button"
            onClick={begin}
            disabled={disabled || isTranscribing || status === 'requesting'}
            className="flex items-center gap-2 py-2.5 px-5 rounded-lg bg-background-light text-text-primary font-bold hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-brand-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <MicIcon className="w-5 h-5" /> Answer out loud
          </button>
        )}

        {status === 'recording' && (
          <p className="flex items-center gap-2 text-text-primary font-semibold">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden="true" />
            {/* Timer is visual only; the live region below announces start and stop instead of every second. */}
            <span role="timer" aria-live="off">Recording {formatTime(elapsedMs)} of {formatTime(MAX_RECORDING_MS)}</span>
          </p>
        )}
        {isTranscribing && (
          <p className="flex items-center gap-2 text-text-secondary">
            <SpinnerIcon className="w-5 h-5 border-2 border-brand-primary" /> Transcribing your answer...
          </p>
        )}
      </div>

      <p className="mt-2 text-xs sm:text-sm text-text-muted">
        Up to 2 minutes. Your recording is sent for transcription and is not stored.
      </p>

      {shownError && (
        <p role="alert" className="mt-3 text-sm text-red-200 bg-red-900/40 border border-red-500/50 rounded-lg p-3">{shownError}</p>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
};

export default VoiceRecorder;
