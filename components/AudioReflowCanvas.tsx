"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from "@chenglou/pretext";
import { useAudio } from "./AudioProvider";
import { TIMED_WORDS, LYRICS_TEXT, WORD_CHAR_STARTS, getCurrentWordIndex } from "./lyrics-data";

// ── Constants ─────────────────────────────────────────────────────
const FONT_SIZES = [24, 28, 32] as const;
const LINE_HEIGHTS = [34, 40, 46] as const;
const PADDING = 60;
const BLOB_POINTS = 128; // resolution of the blob outline
const BASE_RADIUS = 160; // blob radius at silence
const NUM_RINGS = 3;
const MAX_PARTICLES = 120;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;    // 0→1, dies at 1
  maxLife: number;  // total lifetime in "frames"
  size: number;
  alpha: number;
};

export function AudioReflowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Prepared text at 3 font sizes for dynamic sizing
  const preparedRefs = useRef<(PreparedTextWithSegments | null)[]>([null, null, null]);
  const rafRef = useRef<number>(0);
  const smoothedFreqRef = useRef<Float32Array | null>(null);
  const timeRef = useRef(0);
  const smoothAmpRef = useRef(0);
  const smoothScaleRef = useRef(1);
  const smoothFontIdxRef = useRef(1); // smoothed index into FONT_SIZES

  // Persistent blob point radii for smooth animation
  const blobRadiiRef = useRef<Float32Array | null>(null);

  // Particle system
  const particlesRef = useRef<Particle[]>([]);
  const lastWordIdxRef = useRef(-1);

  const { analyserRef, frequencyDataRef, audioRef } = useAudio();

  useEffect(() => {
    for (let i = 0; i < FONT_SIZES.length; i++) {
      const font = `${FONT_SIZES[i]}px system-ui, sans-serif`;
      preparedRefs.current[i] = prepareWithSegments(LYRICS_TEXT, font, { whiteSpace: "pre-wrap" });
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const allPrepared = preparedRefs.current;
    if (!canvas || !allPrepared[0] || !allPrepared[1] || !allPrepared[2]) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // ── Audio analysis ────────────────────────────────────────
    const analyser = analyserRef.current;
    const freqData = frequencyDataRef.current;
    let hasAudio = false;

    if (analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      for (let i = 0; i < freqData.length; i++) {
        if (freqData[i] > 5) { hasAudio = true; break; }
      }
      if (!smoothedFreqRef.current || smoothedFreqRef.current.length !== freqData.length) {
        smoothedFreqRef.current = new Float32Array(freqData.length);
      }
      const sm = smoothedFreqRef.current;
      for (let i = 0; i < freqData.length; i++) {
        sm[i] = sm[i] * 0.7 + freqData[i] * 0.3;
      }
    }

    timeRef.current += 0.008;
    const t = timeRef.current;
    const smoothed = smoothedFreqRef.current;
    const audioTime = audioRef.current?.currentTime ?? 0;
    const currentWordIdx = getCurrentWordIndex(audioTime);
    const cx = w / 2;
    const cy = h / 2;

    // Overall amplitude
    let rawAmp = 0;
    if (smoothed) {
      let sum = 0;
      for (let i = 0; i < smoothed.length; i++) sum += smoothed[i];
      rawAmp = sum / smoothed.length / 255;
    }
    smoothAmpRef.current += (rawAmp - smoothAmpRef.current) * 0.15;
    const amp = smoothAmpRef.current;

    // Word scale
    const targetScale = 1 + amp * 0.15;
    const lerpSpeed = targetScale > smoothScaleRef.current ? 0.3 : 0.1;
    smoothScaleRef.current += (targetScale - smoothScaleRef.current) * lerpSpeed;
    const wordScale = smoothScaleRef.current;

    // ── Dynamic font sizing ──────────────────────────────────
    // Map amplitude to font size index: 0=small, 1=medium, 2=large
    const targetFontIdx = Math.min(2, amp * 3);
    smoothFontIdxRef.current += (targetFontIdx - smoothFontIdxRef.current) * 0.1;
    const fontIdx = Math.round(Math.max(0, Math.min(2, smoothFontIdxRef.current)));
    const prepared = allPrepared[fontIdx]!;
    const fontSize = FONT_SIZES[fontIdx];
    const lineHeight = LINE_HEIGHTS[fontIdx];
    const font = `${fontSize}px system-ui, sans-serif`;

    // ── Blob waveform ─────────────────────────────────────────
    // Each point around the circle maps to a frequency bin.
    // The radius at that angle is BASE_RADIUS + displacement from audio.
    if (!blobRadiiRef.current) {
      blobRadiiRef.current = new Float32Array(BLOB_POINTS).fill(BASE_RADIUS);
    }
    const blobRadii = blobRadiiRef.current;

    // Compute target radii from frequency data
    for (let i = 0; i < BLOB_POINTS; i++) {
      const angle = (i / BLOB_POINTS) * Math.PI * 2;
      let targetR = BASE_RADIUS;

      if (hasAudio && smoothed) {
        // Symmetric mapping: 0→π = low→high freq, π→2π mirrors back
        const halfAngle = angle <= Math.PI ? angle / Math.PI : (2 * Math.PI - angle) / Math.PI;
        const binIdx = Math.floor(halfAngle * (smoothed.length - 1));
        const binAmp = smoothed[binIdx] / 255;

        // Base displacement from audio + organic wobble
        const displacement = binAmp * (30 + amp * 50);
        const wobble = Math.sin(angle * 3 + t * 1.5) * 8 * amp
                     + Math.sin(angle * 5 - t * 2.3) * 4 * amp;

        targetR = BASE_RADIUS + displacement + wobble;
      } else {
        // Idle breathing animation
        targetR = BASE_RADIUS + Math.sin(angle * 3 + t * 0.8) * 4 + Math.sin(t * 0.5) * 6;
      }

      // Smooth interpolation for organic feel
      blobRadii[i] += (targetR - blobRadii[i]) * 0.18;
    }

    // Compute blob outline points
    const blobPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < BLOB_POINTS; i++) {
      const angle = (i / BLOB_POINTS) * Math.PI * 2;
      const r = blobRadii[i];
      blobPoints.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      });
    }

    // ── Radial frequency spikes ──────────────────────────────
    // Lines radiating from center, length driven by frequency bins
    const NUM_SPIKES = 180;
    if (smoothed) {
      for (let i = 0; i < NUM_SPIKES; i++) {
        const angle = (i / NUM_SPIKES) * Math.PI * 2;

        // Symmetric mapping: 0→π = low→high, π→2π mirrors back
        const halfAngle = angle <= Math.PI ? angle / Math.PI : (2 * Math.PI - angle) / Math.PI;
        const binIdx = Math.floor(halfAngle * (smoothed.length - 1));
        const binAmp = smoothed[binIdx] / 255;

        const innerR = BASE_RADIUS * 0.4;
        const spikeLength = binAmp * (80 + amp * 160);
        const outerR = innerR + spikeLength;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);

        const spikeAlpha = 0.08 + binAmp * 0.35;
        ctx.strokeStyle = `rgba(180, 220, 255, ${spikeAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // ── Radial light rays (longer, subtle, motion-blur feel) ──
    if (smoothed) {
      const NUM_RAYS = 64;
      for (let i = 0; i < NUM_RAYS; i++) {
        const rawAngle = (i / NUM_RAYS) * Math.PI * 2 + t * 0.1;
        const angle = ((rawAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        const halfAngle = angle <= Math.PI ? angle / Math.PI : (2 * Math.PI - angle) / Math.PI;
        const binIdx = Math.floor(Math.min(Math.max(halfAngle, 0), 0.999) * (smoothed.length - 1));
        const binAmp = smoothed[binIdx] / 255;

        const innerR = BASE_RADIUS * 0.6;
        const outerR = innerR + binAmp * (200 + amp * 300);

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Gradient line from bright to transparent
        const gradient = ctx.createLinearGradient(
          cx + cos * innerR, cy + sin * innerR,
          cx + cos * outerR, cy + sin * outerR,
        );
        gradient.addColorStop(0, `rgba(51, 204, 255, ${0.03 + binAmp * 0.12})`);
        gradient.addColorStop(1, "rgba(51, 204, 255, 0)");

        ctx.beginPath();
        ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2 + binAmp * 2;
        ctx.stroke();
      }
    }

    // ── Concentric dotted rings ───────────────────────────────
    for (let ring = 0; ring < NUM_RINGS; ring++) {
      const ringRadius = BASE_RADIUS * (0.7 + ring * 0.5) + amp * 30 * ring;
      const dotCount = 60 + ring * 20;
      const dotSize = 1.2 + amp * 1.5;
      const ringAlpha = (0.15 + amp * 0.25) * (1 - ring * 0.25);
      const rotationSpeed = (ring % 2 === 0 ? 1 : -1) * (0.3 + ring * 0.15);

      for (let d = 0; d < dotCount; d++) {
        const angle = (d / dotCount) * Math.PI * 2 + t * rotationSpeed;
        const dx = cx + Math.cos(angle) * ringRadius;
        const dy = cy + Math.sin(angle) * ringRadius;

        // Modulate dot size with nearby frequency
        let sizeMultiplier = 1;
        if (smoothed) {
          const binIdx = Math.floor((d / dotCount) * (smoothed.length - 1));
          sizeMultiplier = 1 + (smoothed[binIdx] / 255) * 1.5;
        }

        ctx.beginPath();
        ctx.arc(dx, dy, dotSize * sizeMultiplier, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(51, 204, 255, ${ringAlpha})`;
        ctx.fill();
      }
    }

    // ── Inner glow fill ───────────────────────────────────────
    ctx.beginPath();
    for (let i = 0; i <= BLOB_POINTS; i++) {
      const idx = i % BLOB_POINTS;
      const next = (i + 1) % BLOB_POINTS;
      const px = blobPoints[idx].x;
      const py = blobPoints[idx].y;
      const nx = blobPoints[next].x;
      const ny = blobPoints[next].y;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, BASE_RADIUS + amp * 120);
    grad.addColorStop(0, `rgba(51, 204, 255, ${0.08 + amp * 0.1})`);
    grad.addColorStop(0.5, `rgba(51, 204, 255, ${0.03 + amp * 0.05})`);
    grad.addColorStop(1, "rgba(51, 204, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Blob outline ──────────────────────────────────────────
    const drawBlobLayer = (radiusScale: number, color: string, lineWidth: number, blur: number) => {
      ctx.beginPath();
      for (let i = 0; i <= BLOB_POINTS; i++) {
        const idx = i % BLOB_POINTS;
        const next = (i + 1) % BLOB_POINTS;
        const px = cx + (blobPoints[idx].x - cx) * radiusScale;
        const py = cy + (blobPoints[idx].y - cy) * radiusScale;
        const bx = cx + (blobPoints[next].x - cx) * radiusScale;
        const by = cy + (blobPoints[next].y - cy) * radiusScale;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.quadraticCurveTo(px, py, (px + bx) / 2, (py + by) / 2);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    drawBlobLayer(1.0, `rgba(51, 204, 255, ${0.4 + amp * 0.5})`, 1.2 + amp * 0.8, 6 + amp * 12);
    drawBlobLayer(0.92, `rgba(100, 220, 255, ${0.08 + amp * 0.15})`, 0.5, 3);

    // ── Exclusion zone: max visual extent at each angle ──────
    // Considers blob outline, spikes, rays, and dotted rings
    const exclusionPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < BLOB_POINTS; i++) {
      const angle = (i / BLOB_POINTS) * Math.PI * 2;
      let maxR = blobRadii[i];

      if (smoothed) {
        const halfAngle = angle <= Math.PI ? angle / Math.PI : (2 * Math.PI - angle) / Math.PI;
        const binIdx = Math.floor(halfAngle * (smoothed.length - 1));
        const binAmp = smoothed[binIdx] / 255;

        // Spike extent
        const spikeOuterR = BASE_RADIUS * 0.4 + binAmp * (80 + amp * 160);
        maxR = Math.max(maxR, spikeOuterR);

        // Ray extent
        const rayOuterR = BASE_RADIUS * 0.6 + binAmp * (200 + amp * 300);
        maxR = Math.max(maxR, rayOuterR);
      }

      // Dotted ring extents
      for (let ring = 0; ring < NUM_RINGS; ring++) {
        const ringRadius = BASE_RADIUS * (0.7 + ring * 0.5) + amp * 30 * ring;
        maxR = Math.max(maxR, ringRadius);
      }

      exclusionPoints.push({
        x: cx + Math.cos(angle) * maxR,
        y: cy + Math.sin(angle) * maxR,
      });
    }

    // ── Text layout around blob (multi-column flow) ──────────
    const contentWidth = w - PADDING * 2;
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y = PADDING;

    type LineInfo = {
      text: string;
      x: number;
      y: number;
      charStart: number;
    };
    const lines: LineInfo[] = [];
    let charOffset = 0;

    // Find exclusion zone left/right extent at a given Y band
    const getExclusionExtentAtY = (lineTop: number, lineBottom: number): { left: number; right: number } | null => {
      let minX = Infinity;
      let maxX = -Infinity;
      let found = false;

      const margin = 16;

      for (let i = 0; i < BLOB_POINTS; i++) {
        const p = exclusionPoints[i];
        if (p.y >= lineTop - margin && p.y <= lineBottom + margin) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          found = true;
        }
      }

      if (!found) return null;
      return { left: minX - margin, right: maxX + margin };
    };

    const emitLine = (lineX: number, maxWidth: number, atY: number): boolean => {
      const line = layoutNextLine(prepared, cursor, maxWidth);
      if (!line) return false;

      const idx = LYRICS_TEXT.indexOf(line.text, charOffset);
      const charStart = idx >= 0 ? idx : charOffset;

      lines.push({ text: line.text, x: lineX, y: atY, charStart });

      charOffset = charStart + line.text.length;
      while (charOffset < LYRICS_TEXT.length && (LYRICS_TEXT[charOffset] === " " || LYRICS_TEXT[charOffset] === "\n")) {
        charOffset++;
      }

      cursor = line.end;
      return true;
    };

    while (y + lineHeight <= h - 80) {
      const lineTop = y;
      const lineBottom = y + lineHeight;

      const extent = getExclusionExtentAtY(lineTop, lineBottom);

      if (extent) {
        const gap = 16;
        const leftSpace = Math.max(0, extent.left - gap - PADDING);
        const rightSpace = Math.max(0, w - PADDING - (extent.right + gap));

        // Multi-column: flow text on both sides when possible
        if (leftSpace > 60 && rightSpace > 60) {
          if (!emitLine(PADDING, leftSpace, y)) break;
          if (!emitLine(extent.right + gap, rightSpace, y)) break;
        } else if (leftSpace > 60) {
          if (!emitLine(PADDING, leftSpace, y)) break;
        } else if (rightSpace > 60) {
          if (!emitLine(extent.right + gap, rightSpace, y)) break;
        }
        // else skip this line (no room)
      } else {
        if (!emitLine(PADDING, contentWidth, y)) break;
      }

      y += lineHeight;
    }

    // ── Draw text (per-character with audio displacement) ─────
    ctx.font = font;
    ctx.textBaseline = "top";

    // Pre-measure character widths
    const charWidths: number[] = [];
    for (let i = 32; i < 127; i++) {
      charWidths[i] = ctx.measureText(String.fromCharCode(i)).width;
    }
    const getCharWidth = (ch: string) => charWidths[ch.charCodeAt(0)] ?? ctx.measureText(ch).width;

    const wordCharStart = hasAudio && currentWordIdx >= 0 ? WORD_CHAR_STARTS[currentWordIdx] : -1;
    const wordCharEnd = wordCharStart >= 0 ? wordCharStart + TIMED_WORDS[currentWordIdx].word.length : -1;
    let currentWordX = -1;
    let currentWordY = -1;

    for (const line of lines) {
      let xCursor = line.x;

      for (let ci = 0; ci < line.text.length; ci++) {
        const ch = line.text[ci];
        if (ch === "\n") continue; // skip newline chars
        const globalCharIdx = line.charStart + ci;
        const cw = getCharWidth(ch);

        const isCurrent = globalCharIdx >= wordCharStart && globalCharIdx < wordCharEnd;
        const isSung = hasAudio && wordCharStart >= 0 && globalCharIdx < wordCharStart;

        // Audio-reactive displacement — based on distance to blob center
        let dy = 0;
        if (hasAudio && smoothed) {
          const charX = xCursor;
          const charY = line.y + lineHeight / 2;
          const dx = charX - cx;
          const ddy = charY - cy;
          const dist = Math.sqrt(dx * dx + ddy * ddy);
          const maxDist = Math.max(BASE_RADIUS * 3, 300);
          const proximity = Math.max(0, 1 - dist / maxDist);

          const nx = xCursor / w;
          const binIdx = Math.floor(nx * (smoothed.length - 1));
          const localAmp = smoothed[binIdx] / 255;

          dy = localAmp * proximity * 8 * Math.sin(nx * Math.PI * 4 + t * 3 + ci * 0.3);
        }

        if (isCurrent) {
          ctx.shadowColor = `rgba(51, 204, 255, ${0.3 + amp * 0.5})`;
          ctx.shadowBlur = 6 + amp * 12;
          ctx.fillStyle = "rgba(255, 255, 255, 1.0)";

          const charCenterX = xCursor + cw / 2;
          const charCenterY = line.y + lineHeight / 2;
          ctx.save();
          ctx.translate(charCenterX, charCenterY);
          ctx.scale(wordScale, wordScale);
          ctx.translate(-charCenterX, -charCenterY);
          ctx.fillText(ch, xCursor, line.y + dy);
          ctx.restore();
          ctx.font = font;
          ctx.shadowBlur = 0;
        } else if (isSung) {
          ctx.fillStyle = "rgba(130, 200, 230, 0.5)";
          ctx.fillText(ch, xCursor, line.y + dy);
        } else {
          ctx.fillStyle = "rgba(200, 210, 220, 0.3)";
          ctx.fillText(ch, xCursor, line.y + dy);
        }

        // Track position of current word's first character for particle spawning
        if (isCurrent && globalCharIdx === wordCharStart) {
          currentWordX = xCursor + cw / 2;
          currentWordY = line.y + lineHeight / 2;
        }

        xCursor += cw;
      }
    }

    // ── Particle system ──────────────────────────────────────
    const particles = particlesRef.current;

    // Spawn particles when a new word activates
    if (currentWordIdx >= 0 && currentWordIdx !== lastWordIdxRef.current && currentWordX >= 0) {
      lastWordIdxRef.current = currentWordIdx;
      const count = 6 + Math.floor(amp * 10); // more particles on louder beats
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        // Direction: from word toward blob center, with spread
        const angle = Math.atan2(cy - currentWordY, cx - currentWordX) + (Math.random() - 0.5) * 1.8;
        const speed = 1.5 + Math.random() * 3 + amp * 2;
        particles.push({
          x: currentWordX + (Math.random() - 0.5) * 20,
          y: currentWordY + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 40 + Math.random() * 40,
          size: 1 + Math.random() * 2,
          alpha: 0.4 + Math.random() * 0.5,
        });
      }
    }

    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += 1;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Gentle pull toward blob center
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        p.vx += (dx / dist) * 0.08;
        p.vy += (dy / dist) * 0.08;
      }

      // Slight drag
      p.vx *= 0.985;
      p.vy *= 0.985;

      const lifeRatio = p.life / p.maxLife;
      // Fade in quickly, fade out slowly
      const fade = lifeRatio < 0.1 ? lifeRatio / 0.1 : 1 - (lifeRatio - 0.1) / 0.9;
      const a = p.alpha * fade;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - lifeRatio * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(51, 204, 255, ${a})`;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [analyserRef, frequencyDataRef, audioRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 10 }}
    />
  );
}
