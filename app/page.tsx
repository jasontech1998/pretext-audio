"use client";

import { AudioProvider } from "@/components/AudioProvider";
import { YouTubeBackground } from "@/components/YouTubeBackground";
import { AudioReflowCanvas } from "@/components/AudioReflowCanvas";
import { Controls } from "@/components/Controls";

export default function Home() {
  return (
    <AudioProvider>
      <div className="relative w-full h-screen overflow-hidden bg-black">
        <YouTubeBackground />
        <AudioReflowCanvas />
        <Controls />
      </div>
    </AudioProvider>
  );
}
