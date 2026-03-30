"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAudio } from "./AudioProvider";

const VIDEO_ID = "lqzR7yMmQYs";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export function YouTubeBackground() {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isPlaying, currentTime, audioRef } = useAudio();

  const initPlayer = useCallback(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: VIDEO_ID,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        loop: 1,
        modestbranding: 1,
        mute: 1,
        playsinline: 1,
        rel: 0,
        showinfo: 0,
        playlist: VIDEO_ID,
      },
      events: {
        onReady: () => {
          playerRef.current?.mute();
          playerRef.current?.setPlaybackQuality("hd1080");
        },
      },
    });
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }

    window.onYouTubeIframeAPIReady = () => initPlayer();

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);

    return () => {
      window.onYouTubeIframeAPIReady = undefined;
    };
  }, [initPlayer]);

  // Sync play/pause state with audio
  useEffect(() => {
    const player = playerRef.current;
    if (!player?.playVideo) return;

    if (isPlaying) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, [isPlaying]);

  // Sync video time to audio time periodically
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      const audio = audioRef.current;
      if (!player?.seekTo || !audio) return;

      const audioTime = audio.currentTime;
      const videoTime = player.getCurrentTime?.() ?? 0;
      const drift = Math.abs(audioTime - videoTime);

      // Re-sync if drift > 0.5s
      if (drift > 0.5) {
        player.seekTo(audioTime, true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isPlaying, audioRef]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        ref={containerRef}
        className="absolute"
        style={{
          // Scale up to cover and hide black bars
          top: "50%",
          left: "50%",
          width: "120vw",
          height: "120vh",
          transform: "translate(-50%, -50%)",
        }}
      />
      {/* Dark overlay — slightly heavier in center to hide YouTube play button */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.8) 100%)",
        }}
      />
    </div>
  );
}
