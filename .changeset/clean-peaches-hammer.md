---
"life": major
---

# OpenAI Speech-to-Text Provider Addition

## What Changed

- Added new OpenAI STT provider with support for multiple models (whisper-1, tts-1, tts-1-hd)
- Introduced additional configuration options for fine-tuning transcription:
  - prompt: Guide model's understanding and style
  - temperature: Control output variation
  - responseFormat: Support for multiple output formats (text, json, srt, vtt)

## Why

- Provides more accurate transcription options through OpenAI's latest models
- Enables flexible output formats for different use cases (plain text, subtitles)
- Allows fine-tuning of transcription behavior through prompts and temperature

HOW TO UPDATE:
If you're using STT in your agent, update your configuration:

```typescript
// Before
const agent = new Agent({
  stt: {
    provider: "deepgram",
    // ... deepgram config
  }
});

// After - Basic OpenAI usage
const agent = new Agent({
  stt: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "whisper-1",
    language: "en"
  }
});

// After - Advanced OpenAI usage
const agent = new Agent({
  stt: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "tts-1-hd",
    language: "en",
    prompt: "Technical discussion",
    temperature: 0.3,
    responseFormat: "text"
  }
});
```
