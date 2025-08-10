import OpenAI from "openai";
import { z } from "zod";
import { STTBase, type STTGenerateJob } from "../base";

// Config
export const openaiSTTConfigSchema = z.object({
  apiKey: z.string().default(process.env.OPENAI_API_KEY ?? ""),
  model: z.enum([
    // Main speech models
    "whisper-1",
    "tts-1", 
    "tts-1-hd",
  ]).default("whisper-1"),
  language: z.string().default("en"),
  // Optional configurations
  prompt: z.string().optional(), // Optional text to guide the model's style or continue from
  temperature: z.number().min(0).max(1).optional(), // Control randomness in non-deterministic results
  responseFormat: z.enum(["json", "text", "srt", "verbose_json", "vtt"]).optional(), // Output format
});

// Model
export class OpenAISTT extends STTBase<typeof openaiSTTConfigSchema> {
  #openai: OpenAI;
  #audioBuffer: Int16Array[];
  #processingPromise: Promise<void> | null = null;

  constructor(config: z.input<typeof openaiSTTConfigSchema>) {
    super(openaiSTTConfigSchema, config);
    if (!config.apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    }
    this.#openai = new OpenAI({ apiKey: config.apiKey });
    this.#audioBuffer = [];
  }

  async generate(): Promise<STTGenerateJob> {
    const job = this.createGenerateJob();

    // Clear the audio buffer
    this.#audioBuffer = [];

    // Handle job cancellation
    job.raw.abortController.signal.addEventListener("abort", () => {
      this.#audioBuffer = [];
      this.#processingPromise = null;
    });

    return job;
  }

  protected async _onGeneratePushVoice(job: STTGenerateJob, pcm: Int16Array) {
    // Add the new audio chunk to the buffer
    this.#audioBuffer.push(pcm);

    // If we're not already processing, start processing
    if (!this.#processingPromise) {
      this.#processingPromise = this.processAudioBuffer(job);
    }
  }

  private async processAudioBuffer(job: STTGenerateJob): Promise<void> {
    if (this.#audioBuffer.length === 0 || job.raw.abortController.signal.aborted) {
      this.#processingPromise = null;
      return;
    }

    // Convert Int16Array to WAV format
    const audioData = this.concatenateAudioChunks(this.#audioBuffer);
    this.#audioBuffer = []; // Clear the buffer after processing

      try {
      // Convert WAV data to a buffer that OpenAI can accept
      const wavBuffer = Buffer.from(this.createWAVFile(audioData));
      const response = await this.#openai.audio.transcriptions.create({
        file: new File([wavBuffer], "audio.wav", { type: "audio/wav" }),
        model: this.config.model,
        language: this.config.language,
        response_format: this.config.responseFormat ?? "text",
        ...(this.config.prompt && { prompt: this.config.prompt }),
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
      });
      
      if (!job.raw.abortController.signal.aborted && response) {
        // Handle different response formats
        let textChunk: string;
        if (typeof response === 'string') {
          textChunk = response;
        } else if ('text' in response) {
          textChunk = response.text;
        } else {
          textChunk = JSON.stringify(response);
        }
        job.raw.receiveChunk({ type: "content", textChunk });
      }
    } catch (error) {
      if (!job.raw.abortController.signal.aborted) {
        job.raw.receiveChunk({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }

    // Process any new chunks that arrived while we were processing
    if (this.#audioBuffer.length > 0 && !job.raw.abortController.signal.aborted) {
      await this.processAudioBuffer(job);
    } else {
      this.#processingPromise = null;
    }
  }

  private concatenateAudioChunks(chunks: Int16Array[]): Int16Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private createWAVFile(audioData: Int16Array): Uint8Array {
    const numChannels = 1;
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const subchunk2Size = audioData.length * (bitsPerSample / 8);
    const chunkSize = 36 + subchunk2Size;

    const buffer = new ArrayBuffer(44 + subchunk2Size);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF"); // ChunkID
    view.setUint32(4, chunkSize, true); // ChunkSize
    writeString(8, "WAVE"); // Format
    writeString(12, "fmt "); // Subchunk1ID
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample
    writeString(36, "data"); // Subchunk2ID
    view.setUint32(40, subchunk2Size, true); // Subchunk2Size

    // Write audio data
    const offset = 44;
      for (let i = 0; i < audioData.length; i++) {
        const value = audioData[i];
        if (typeof value === 'number') {
          view.setInt16(offset + i * 2, value, true);
        }
      }    return new Uint8Array(buffer);
  }
}
