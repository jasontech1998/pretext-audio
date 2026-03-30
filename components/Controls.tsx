"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider";

export function Controls() {
  const { isPlaying, play, pause, currentTime, duration, seek, audioRef, analyserRef } = useAudio();
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const audioDuration = audioRef.current?.duration || duration;
  const progress = audioDuration > 0 ? currentTime / audioDuration : 0;

  // Keyboard controls: space = play/pause, arrows = seek ±5s
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (audioRef.current?.paused) play();
        else pause();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seek(Math.min((audioRef.current?.currentTime ?? 0) + 5, audioDuration));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max((audioRef.current?.currentTime ?? 0) - 5, 0));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [play, pause, seek, audioRef, audioDuration]);

  // Update page title with current track info
  useEffect(() => {
    if (isPlaying) {
      document.title = `Ye — Damn · ${formatTime(currentTime)} — Wavetext`;
    } else {
      document.title = "Wavetext";
    }
  }, [isPlaying, currentTime]);

  // Auto-hide controls + cursor after 3s of no mouse movement
  useEffect(() => {
    const show = () => {
      setVisible(true);
      document.body.style.cursor = "";
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        document.body.style.cursor = "none";
      }, 3000);
    };
    window.addEventListener("mousemove", show);
    show();
    return () => {
      window.removeEventListener("mousemove", show);
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Mini waveform visualizer in the progress bar
  useEffect(() => {
    const canvas = miniCanvasRef.current;
    if (!canvas) return;

    const draw = () => {
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

      const analyser = analyserRef.current;
      const barWidth = w;
      const progressX = progress * barWidth;

      // Draw track background
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, h / 2 - 1, w, 2);

      if (analyser && isPlaying) {
        // Draw mini frequency bars across the progress area
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        const barCount = 80;
        const gap = 1.5;
        const barW = (barWidth - (barCount - 1) * gap) / barCount;

        for (let i = 0; i < barCount; i++) {
          const x = i * (barW + gap);
          const binIdx = Math.floor((i / barCount) * freqData.length * 0.6);
          const amp = freqData[binIdx] / 255;
          const barH = Math.max(1, amp * (h - 4));
          const y = (h - barH) / 2;

          const isPast = x + barW <= progressX;
          const isCurrent = x <= progressX && x + barW > progressX;

          if (isPast) {
            ctx.fillStyle = `rgba(51, 204, 255, ${0.3 + amp * 0.5})`;
          } else if (isCurrent) {
            ctx.fillStyle = `rgba(51, 204, 255, ${0.5 + amp * 0.5})`;
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + amp * 0.08})`;
          }

          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, 1);
          ctx.fill();
        }
      } else {
        // Static: just show elapsed bar
        if (progressX > 0) {
          ctx.fillStyle = "rgba(51, 204, 255, 0.35)";
          ctx.fillRect(0, h / 2 - 1, progressX, 2);
        }
      }

      // Playhead line
      if (progressX > 0) {
        ctx.fillStyle = "rgba(51, 204, 255, 0.9)";
        ctx.fillRect(progressX - 0.5, 2, 1, h - 4);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef, isPlaying, progress]);

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const canvas = miniCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(x * (audioDuration || 0));
    },
    [audioDuration, seek]
  );

  return (
    <>
    {/* Created by — top left */}
    <div
      className="absolute top-5 left-7 pointer-events-none"
      style={{
        zIndex: 20,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
    >
      <span
        className="text-[10px] tracking-[0.2em] uppercase"
        style={{
          fontFamily: "ui-monospace, monospace",
          color: "rgba(255,255,255,0.18)",
        }}
      >
        Wavetext
      </span>
      <span
        className="text-[9px] tracking-[0.15em] mt-0.5 block"
        style={{
          fontFamily: "ui-monospace, monospace",
          color: "rgba(255,255,255,0.10)",
        }}
      >
        by Jason Yu
      </span>
    </div>

    <div
      className="absolute bottom-0 left-0 right-0"
      style={{
        zIndex: 20,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Gradient fade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
          opacity: hovered ? 1 : 0.6,
          transition: "opacity 0.3s ease",
        }}
      />

      <div className="relative flex items-center gap-5 px-7 py-5">
        {/* Play / Pause — minimal circle */}
        <button
          onClick={isPlaying ? pause : play}
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="rgba(255,255,255,0.75)">
              <rect x="1.5" y="1" width="2.2" height="8" rx="0.6" />
              <rect x="6.3" y="1" width="2.2" height="8" rx="0.6" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="rgba(255,255,255,0.75)" className="ml-[1px]">
              <path d="M2.5 1v8l6.5-4z" />
            </svg>
          )}
        </button>

        {/* Time — current only, compact */}
        <span
          className="text-[10px] shrink-0 tabular-nums"
          style={{
            fontFamily: "ui-monospace, monospace",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          {formatTime(currentTime)}
        </span>

        {/* Waveform progress bar */}
        <div
          className="flex-1 cursor-pointer"
          style={{ height: 24 }}
          onClick={handleBarClick}
        >
          <canvas
            ref={miniCanvasRef}
            className="w-full h-full"
          />
        </div>

        {/* Duration */}
        <span
          className="text-[10px] shrink-0 tabular-nums"
          style={{
            fontFamily: "ui-monospace, monospace",
            color: "rgba(255,255,255,0.2)",
          }}
        >
          {formatTime(audioDuration)}
        </span>

        {/* Song info — separated by a subtle dot */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[3px] h-[3px] rounded-full" style={{ background: "rgba(51,204,255,0.3)" }} />
          <span
            className="text-[9px] tracking-[0.2em] uppercase"
            style={{
              fontFamily: "ui-monospace, monospace",
              color: "rgba(255,255,255,0.2)",
            }}
          >
            Ye
          </span>
          <span
            className="text-[9px] tracking-[0.15em] uppercase"
            style={{
              fontFamily: "ui-monospace, monospace",
              color: "rgba(255,255,255,0.12)",
            }}
          >
            Damn
          </span>
        </div>
      </div>
    </div>
    </>
  );
}
