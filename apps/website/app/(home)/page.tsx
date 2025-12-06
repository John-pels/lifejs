import Link from "next/link";

export default function Home() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="font-bold text-2xl">Life.js</h1>
      <p className="text-neutral-600">Build agents that speak, write, and touch.</p>
      <Link
        className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
        href="/docs"
      >
        Read the Docs
      </Link>
    </main>
  );
}
