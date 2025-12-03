import type { Metadata } from "next";
import type React from "react";
import "./globals.css";
import { LifeProvider } from "life/react";
import { life } from "@/lib/life";

export const metadata: Metadata = {
  title: "Life.js • Playground",
  description:
    "This is a demo application, used by Life.js developers to run experiments with the latest features.",
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <html lang="en">
      <LifeProvider client={life}>
        <body>{children}</body>
      </LifeProvider>
    </html>
  );
}
