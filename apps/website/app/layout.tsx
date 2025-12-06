import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NextProvider } from "fumadocs-core/framework/next";
import { SearchBar } from "../components/search";

export const metadata: Metadata = {
  title: { template: "%s | Life.js", default: "🌱" },
  description:
    "The framework to build agents that speak, write, and touch. Minimal, extensible, and typesafe.",
};

const navLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/examples", label: "Examples" },
  { href: "/changelog", label: "Changelog" },
];

interface Props {
  children: React.ReactNode;
}

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en">
      <body className="antialiased">
        <NextProvider>
          <header className="border-neutral-200 border-b px-4 py-3">
            <nav className="flex items-center gap-6">
              <Link className="font-semibold" href="/">
                Life.js
              </Link>
              <div className="flex gap-4 text-sm">
                {navLinks.map((link) => (
                  <Link
                    className="text-neutral-600 hover:text-neutral-900"
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="ml-auto">
                <SearchBar />
              </div>
            </nav>
          </header>
          {children}
        </NextProvider>
      </body>
    </html>
  );
}
