/**
 * Gemini-backed SpeechClient. Server-side only.
 *
 * Gemini's TTS models return raw little-endian PCM, not a container format, so
 * the bytes are unplayable until a RIFF/WAV header is prepended. It also gives
 * no word timings — renderers that need karaoke highlighting should keep using
 * the browser's SpeechSynthesis boundary events.
 */
import type { MediaAsset } from 'prism-shared';
import type { SpeechClient } from '../media.js';

export interface GeminiSpeechOptions {
  apiKey: string;
  model?: string;
  /** Gemini prebuilt voice name. */
  voice?: string;
}

export const DEFAULT_SPEECH_MODEL = 'gemini-2.5-flash-preview-tts';
export const DEFAULT_VOICE = 'Kore';

interface SpeechResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
}

export function createGeminiSpeechClient(opts: GeminiSpeechOptions): SpeechClient {
  const model = opts.model ?? DEFAULT_SPEECH_MODEL;
  const voice = opts.voice ?? DEFAULT_VOICE;

  return {
    async speak({ text }) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`Gemini TTS ${res.status}: ${body}`);
      }

      const data = (await res.json()) as SpeechResponse;
      const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!part?.data) throw new Error('Gemini TTS response did not contain audio data.');

      const pcm = Buffer.from(part.data, 'base64');
      const sampleRate = parseSampleRate(part.mimeType);
      const wav = wrapPcmInWav(pcm, sampleRate);

      return {
        dataUrl: `data:audio/wav;base64,${wav.toString('base64')}`,
        mimeType: 'audio/wav',
        durationMs: Math.round((pcm.length / 2 / sampleRate) * 1000),
      } satisfies MediaAsset;
    },
  };
}

/** Gemini reports e.g. "audio/L16;codec=pcm;rate=24000". */
function parseSampleRate(mimeType: string | undefined): number {
  const match = mimeType?.match(/rate=(\d+)/);
  return match ? Number(match[1]) : 24_000;
}

/** Minimal 44-byte RIFF header for 16-bit mono PCM. */
function wrapPcmInWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
