import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wavetext",
  description: "Audio-reactive text reflow visualizer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
