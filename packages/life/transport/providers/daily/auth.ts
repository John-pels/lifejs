void 0;
// import type { GetTokenFunction } from "@/transport/auth";

// export const getToken: GetTokenFunction = async (roomName, participantId) => {
//   const apiKey = process.env.DAILY_API_KEY;

//   if (!apiKey) {
//     throw new Error("Daily API key not provided");
//   }

//   // Create a new room using Daily's API
//   const roomResponse = await fetch("https://api.daily.co/v1/rooms", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${apiKey}`,
//     },
//     body: JSON.stringify({
//       name: roomName,
//       properties: {
//         exp: Math.floor(Date.now() / 1000) + 3600, // Expire in 1 hour
//       },
//     }),
//   });

//   const roomData = await roomResponse.json();

//   if (!roomData || !roomData.url) throw new Error("Failed to create Daily room");

//   // Create a meeting token using Daily's API
//   const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${apiKey}`,
//     },
//     body: JSON.stringify({
//       properties: {
//         room_name: roomName,
//         exp: Math.floor(Date.now() / 1000) + 3600, // Expire in 1 hour
//       },
//     }),
//   });

//   const tokenData = await tokenResponse.json();

//   if (!tokenData || !tokenData.token) {
//     throw new Error("Failed to create Daily meeting token");
//   }

//   return tokenData.token;
// };
