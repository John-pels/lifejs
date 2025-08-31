"use client";
// import { clients } from "life/client";
import Image from "next/image";
import { useState } from "react";
import { FancyButton } from "../../components/ui/fancy-button";
// import { fetchToken } from "./actions";

// const client = new AgentClient({
//   transport: {
//     provider: "livekit",
//     serverUrl: "ws://127.0.0.1:7880",
//   },
// });

export default function Home() {
  const [token, setToken] = useState<string | null>(null);

  const startDiscussion = () => {
    // const newToken = await fetchToken();
    setToken("newToken");
    // await clients.example.say("Hello, world!");
  };

  // console.log(clients);

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

        <FancyButton className="text-white" onClick={() => startDiscussion()} size="md">
          Start Discussion
        </FancyButton>
      </div>
      {/* 
        <div className="mx-auto grid w-fit grid-cols-2 gap-8">
          <button
            className="h-32 w-32 cursor-pointer rounded-xl bg-red-500 shadow-lg transition-transform hover:scale-105"
            onMouseEnter={() => client.say("You're on the red square")}
            type="button"
          ></button>
          <button
            className="h-32 w-32 cursor-pointer rounded-xl bg-blue-500 shadow-lg transition-transform hover:scale-105"
            onMouseEnter={() => client.say("You're on the blue square")}
            type="button"
          ></button>
          <button
            className="h-32 w-32 cursor-pointer rounded-xl bg-green-500 shadow-lg transition-transform hover:scale-105"
            onMouseEnter={() => client.say("You're on the green square")}
            type="button"
          ></button>
          <button
            className="h-32 w-32 cursor-pointer rounded-xl bg-yellow-500 shadow-lg transition-transform hover:scale-105"
            onMouseEnter={() => client.say("You're on the yellow square")}
            type="button"
          ></button>
        </div>
      </div>
      */}

      <div className="absolute right-4 bottom-4 left-4 flex items-center justify-center text-center">
        <p className="max-w-[710px] text-pretty break-all text-gray-400 text-xs">Token: {token}</p>
      </div>
    </main>
  );
}
