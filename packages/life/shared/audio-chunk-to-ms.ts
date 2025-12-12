export function audioChunkToMs(audioChunk: Int16Array, sampleRate = 16_000) {
  return (audioChunk.length / sampleRate) * 1000;
}
