"use client";

import { AudioReflowCanvas } from "@/components/AudioReflowCanvas";
import { AudioProvider } from "@/components/AudioProvider";

export default function Home() {
  return (
    <AudioProvider>
      <AudioReflowCanvas />
    </AudioProvider>
  );
}
