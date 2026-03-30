"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type AudioState = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyserRef: React.RefObject<AnalyserNode | null>;
  frequencyDataRef: React.RefObject<Uint8Array<ArrayBuffer> | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
};

const AudioCtx = createContext<AudioState | null>(null);

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be inside AudioProvider");
  return ctx;
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioCtxRef = useRef<globalThis.AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceCreatedRef = useRef(false);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const ensureAnalyser = useCallback(() => {
    if (!audioCtxRef.current && audioRef.current) {
      const ctx = new window.AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      analyser.connect(ctx.destination);

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      sourceCreatedRef.current = true;
    }
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    ensureAnalyser();
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }
    audio.play();
    setIsPlaying(true);
  }, [ensureAnalyser]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  return (
    <AudioCtx.Provider
      value={{
        isPlaying,
        currentTime,
        duration,
        analyserRef,
        frequencyDataRef,
        audioRef,
        play,
        pause,
        seek,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        src="/song.mp3"
        preload="auto"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
      />
    </AudioCtx.Provider>
  );
}
