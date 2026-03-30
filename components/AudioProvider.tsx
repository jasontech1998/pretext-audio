"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

type AudioState = {
  isPlaying: boolean;
  fileName: string | null;
  analyserRef: React.RefObject<AnalyserNode | null>;
  frequencyDataRef: React.RefObject<Uint8Array<ArrayBuffer> | null>;
  play: () => void;
  pause: () => void;
  loadFile: (file: File) => void;
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
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const ensureContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const ctx = new window.AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    return audioCtxRef.current;
  }, []);

  const play = useCallback(() => {
    const ctx = ensureContext();
    const buffer = bufferRef.current;
    if (!buffer) return;

    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyserRef.current!);
    source.onended = () => {
      setIsPlaying(false);
      offsetRef.current = 0;
    };

    source.start(0, offsetRef.current);
    startTimeRef.current = ctx.currentTime - offsetRef.current;
    sourceRef.current = source;
    setIsPlaying(true);
  }, [ensureContext]);

  const pause = useCallback(() => {
    if (sourceRef.current && audioCtxRef.current) {
      offsetRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      const ctx = ensureContext();
      setFileName(file.name.replace(/\.[^.]+$/, ""));
      offsetRef.current = 0;

      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch {}
        sourceRef.current = null;
      }
      setIsPlaying(false);

      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        bufferRef.current = audioBuffer;

        // Auto-play
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyserRef.current!);
        source.onended = () => {
          setIsPlaying(false);
          offsetRef.current = 0;
        };
        source.start(0);
        startTimeRef.current = ctx.currentTime;
        sourceRef.current = source;
        setIsPlaying(true);
      };
      reader.readAsArrayBuffer(file);
    },
    [ensureContext]
  );

  return (
    <AudioCtx.Provider
      value={{
        isPlaying,
        fileName,
        analyserRef,
        frequencyDataRef,
        play,
        pause,
        loadFile,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}
