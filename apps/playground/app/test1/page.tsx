"use client";
import { useAgent } from "life/react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { FancyButton } from "../../components/ui/fancy-button";

export default function Home() {
  const agent = useAgent("example");

  const startDiscussion = () => {
    agent?.start({ userId: "123" });
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8">
      <div className="space-y-8 text-center">
        <Image
          alt="Life.js"
          className="mx-auto mb-12 h-6 w-auto opacity-70"
          height={200}
          src="/logo-full.png"
          width={200}
        />
        {!agent?.isStarted && (
          <FancyButton className="text-white" onClick={() => startDiscussion()} size="md">
            Start Discussion
          </FancyButton>
        )}
      </div>

      <div
        className={cn(
          "mx-auto grid w-fit grid-cols-2 gap-8",
          agent?.isStarted && "pointer-events-none cursor-not-allowed opacity-50",
        )}
      >
        <button
          className="h-32 w-32 cursor-pointer rounded-xl bg-red-500 shadow-lg transition-transform hover:scale-105"
          onMouseEnter={() => agent?.generation.say({ text: "You're on the red square" })}
          type="button"
        />
        <button
          className="h-32 w-32 cursor-pointer rounded-xl bg-blue-500 shadow-lg transition-transform hover:scale-105"
          onMouseEnter={() => agent?.generation.say({ text: "You're on the blue square" })}
          type="button"
        />
        <button
          className="h-32 w-32 cursor-pointer rounded-xl bg-green-500 shadow-lg transition-transform hover:scale-105"
          onMouseEnter={() => agent?.generation.say({ text: "You're on the green square" })}
          type="button"
        />
        <button
          className="h-32 w-32 cursor-pointer rounded-xl bg-yellow-500 shadow-lg transition-transform hover:scale-105"
          onMouseEnter={() => agent?.generation.say({ text: "You're on the yellow square" })}
          type="button"
        />
      </div>
    </main>
  );
}
