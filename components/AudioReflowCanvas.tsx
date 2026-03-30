"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from "@chenglou/pretext";
import { useAudio } from "./AudioProvider";

const DEFAULT_LYRICS = `I've been searchin' for a feeling like that
One that makes me feel like I'm on top of the world
And I'm never coming down
Every beat is like a heartbeat pounding through me
Every note is like a signal from the universe
Telling me to let it out

The sound waves carry me away
Through every word I want to say
The rhythm pulls me closer now
I feel the music all around

Lost in the frequency tonight
Every syllable ignites
The bass line hits beneath my feet
And makes the silence obsolete

We're all just wavelengths in the dark
Searching for a place to start
The melody becomes the map
That leads us through the noise and back

Turn it up and let it breathe
Let the chorus set you free
Every lyric finds its home
When the speakers hit that tone

The treble dances overhead
Like every word that's left unsaid
The subwoofer rumbles deep below
A language only hearts can know

So let the audio unfold
Let every story find its told
The music bends around the light
And fills the spaces of the night

We ride the waveform to the end
Where silence waits to start again
But until then we let it play
And let the sound waves lead the way`;

const FONT = "17px Inter, system-ui, sans-serif";
const LINE_HEIGHT = 28;
const PADDING = 40;

export function AudioReflowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preparedRef = useRef<PreparedTextWithSegments | null>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const [lyrics, setLyrics] = useState(DEFAULT_LYRICS);
  const [showInput, setShowInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  const { isPlaying, fileName, play, pause, loadFile, analyserRef, frequencyDataRef } = useAudio();

  // Re-prepare text when lyrics change
  useEffect(() => {
    document.fonts.ready.then(() => {
      preparedRef.current = prepareWithSegments(lyrics, FONT);
    });
  }, [lyrics]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const prepared = preparedRef.current;
    if (!canvas || !prepared) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Get frequency data if audio is playing
    const analyser = analyserRef.current;
    const freqData = frequencyDataRef.current;
    let hasAudio = false;

    if (analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      // Check if there's actual audio data
      for (let i = 0; i < freqData.length; i++) {
        if (freqData[i] > 0) { hasAudio = true; break; }
      }
    }

    timeRef.current += 0.012;
    const t = timeRef.current;

    const contentWidth = w - PADDING * 2;

    // Layout text with wave displacement
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y = PADDING;
    const lines: {
      text: string;
      x: number;
      y: number;
      width: number;
      displacement: number;
      intensity: number;
    }[] = [];

    while (y + LINE_HEIGHT <= h - 60) {
      const normalizedY = (y - PADDING) / (h - PADDING * 2);
      let displacement = 0;
      let intensity = 0;

      if (hasAudio && freqData) {
        // Map line position to frequency bins — bass at top, treble at bottom
        const binIndex = Math.floor(normalizedY * freqData.length * 0.6);
        const bin = Math.min(binIndex, freqData.length - 1);

        // Average a few neighboring bins for smoother wave
        let sum = 0;
        let count = 0;
        for (let i = Math.max(0, bin - 2); i <= Math.min(freqData.length - 1, bin + 2); i++) {
          sum += freqData[i];
          count++;
        }
        const freqValue = sum / count;
        intensity = freqValue / 255;

        // Wave displacement driven by audio
        const wave1 = Math.sin(normalizedY * Math.PI * 2.5 + t * 1.8) * intensity;
        const wave2 = Math.cos(normalizedY * Math.PI * 4 - t * 1.2) * intensity * 0.4;
        displacement = (wave1 + wave2) * 100;
      } else {
        // Idle: gentle breathing wave
        const wave = Math.sin(normalizedY * Math.PI * 2 + t * 0.6);
        const wave2 = Math.sin(normalizedY * Math.PI * 3.5 - t * 0.4) * 0.4;
        displacement = (wave + wave2) * 25;
        intensity = 0.2 + Math.abs(wave) * 0.15;
      }

      // Convert displacement to left margin
      const absDisp = Math.abs(displacement);
      const maxWidth = Math.max(80, contentWidth - absDisp);
      let lineX: number;

      if (displacement > 0) {
        lineX = PADDING + absDisp;
      } else {
        lineX = PADDING;
      }

      const line = layoutNextLine(prepared, cursor, maxWidth);
      if (!line) break;

      lines.push({
        text: line.text,
        x: lineX,
        y,
        width: line.width,
        displacement,
        intensity,
      });
      cursor = line.end;
      y += LINE_HEIGHT;
    }

    // Draw wave glow behind text
    if (lines.length > 1) {
      // Broad glow
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const px = w / 2 + line.displacement * 0.5;
        const py = line.y + LINE_HEIGHT / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const glowAlpha = hasAudio ? 0.12 : 0.04;
      ctx.strokeStyle = `rgba(139, 92, 246, ${glowAlpha})`;
      ctx.lineWidth = 60;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.filter = "blur(8px)";
      ctx.stroke();
      ctx.filter = "none";

      // Thin accent line
      ctx.beginPath();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const px = w / 2 + line.displacement * 0.5;
        const py = line.y + LINE_HEIGHT / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const lineAlpha = hasAudio ? 0.35 : 0.08;
      ctx.strokeStyle = `rgba(139, 92, 246, ${lineAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Draw text
    ctx.font = FONT;
    for (const line of lines) {
      const alpha = hasAudio
        ? 0.4 + line.intensity * 0.6
        : 0.55 + line.intensity * 0.3;

      // Subtle purple tint based on intensity
      const r = Math.round(210 + line.intensity * 45);
      const g = Math.round(210 - line.intensity * 30);
      const b = Math.round(220 + line.intensity * 35);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillText(line.text, line.x, line.y + LINE_HEIGHT - 8);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [analyserRef, frequencyDataRef]);

  // Start render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      isDraggingRef.current = false;
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        loadFile(file);
      }
    },
    [loadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#050505]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onDragOver={(e) => {
          e.preventDefault();
          isDraggingRef.current = true;
        }}
        onDragLeave={() => { isDraggingRef.current = false; }}
        onDrop={handleFileDrop}
      />

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] backdrop-blur-md border border-white/[0.08] text-sm text-white/60 hover:text-white/80 transition-all cursor-pointer"
          >
            {fileName ?? "Load audio"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {fileName && (
            <button
              onClick={isPlaying ? pause : play}
              className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.1] backdrop-blur-md border border-white/[0.08] flex items-center justify-center transition-all cursor-pointer text-white/60 hover:text-white/80"
            >
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="2" y="1" width="3.5" height="12" rx="1" />
                  <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3 1.5v11l9-5.5z" />
                </svg>
              )}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowInput(!showInput)}
          className="px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] backdrop-blur-md border border-white/[0.08] text-xs text-white/50 hover:text-white/70 transition-all cursor-pointer pointer-events-auto"
        >
          {showInput ? "Close" : "Edit lyrics"}
        </button>
      </div>

      {/* Lyrics editor panel */}
      {showInput && (
        <div className="absolute top-4 right-4 w-80 pointer-events-auto">
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            className="w-full h-72 p-4 rounded-xl bg-black/70 backdrop-blur-md border border-white/[0.08] text-sm text-white/70 resize-none focus:outline-none focus:border-white/15 placeholder:text-white/20"
            placeholder="Paste lyrics here..."
          />
        </div>
      )}

      {/* Title */}
      <div className="absolute top-5 left-6 pointer-events-none">
        <h1 className="text-[10px] font-mono text-white/20 tracking-[0.2em] uppercase">
          Pretext Audio
        </h1>
      </div>
    </div>
  );
}
