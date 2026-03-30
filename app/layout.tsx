import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pretext Audio",
  description: "Audio-reactive text reflow powered by Pretext",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
