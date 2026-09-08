import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Internet Price Tag",
  description: "A symbolic market for the internet's most recognizable domains.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
