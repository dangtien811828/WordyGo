/**
 * TTS service — Google Cloud Text-to-Speech REST API + Cloudflare R2 cache.
 *
 * Cache layers (checked in order):
 *  1. tts_cache table (source_text_hash, accent, voice_name) — DB lookup.
 *  2. Google TTS REST → upload MP3 to R2 → INSERT cache row.
 *
 * JSON / DB contract is snake_case; TS locals are camelCase.
 */
import crypto from 'crypto';
import pool from '../config/db';
import { uploadAudio } from './storageClient';

const VOICE_US = 'en-US-Neural2-D';
const VOICE_UK = 'en-GB-Neural2-B';
const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 5000;

export type Accent = 'us' | 'uk';
export type SourceType =
  | 'dictionary_headword'
  | 'dictionary_example'
  | 'ebook_paragraph';

export interface GenerateAudioInput {
  text: string;
  accent: Accent;
  source_type: SourceType;
  source_id?: string;
}

export interface GenerateAudioResult {
  audio_url: string;
  cached: boolean;
  char_count: number;
}

interface GoogleTtsResponse {
  audioContent?: string;
  error?: { code: number; message: string; status: string };
}

export async function generateAudio(
  input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  const text = (input.text ?? '').trim();
  const { accent, source_type, source_id } = input;

  if (text.length === 0) {
    throw new Error('TTS: text is empty');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`TTS: text exceeds ${MAX_TEXT_LENGTH} characters (got ${text.length})`);
  }
  if (accent !== 'us' && accent !== 'uk') {
    throw new Error(`TTS: invalid accent "${accent}" (must be 'us' or 'uk')`);
  }

  const voiceName = accent === 'us' ? VOICE_US : VOICE_UK;
  const languageCode = accent === 'us' ? 'en-US' : 'en-GB';

  const sourceTextHash = crypto
    .createHash('sha256')
    .update(`${text}|${accent}|${voiceName}`)
    .digest('hex')
    .substring(0, 16);

  try {
    // 1. DB cache lookup.
    const cacheHit = await pool.query<{ audio_url: string; char_count: number }>(
      `SELECT audio_url, char_count
         FROM tts_cache
        WHERE source_text_hash = $1 AND accent = $2 AND voice_name = $3
        LIMIT 1`,
      [sourceTextHash, accent, voiceName]
    );

    if (cacheHit.rows.length > 0) {
      const row = cacheHit.rows[0];
      return {
        audio_url: row.audio_url,
        cached: true,
        char_count: row.char_count,
      };
    }

    // 2. Cache miss → Google TTS REST.
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_TTS_API_KEY environment variable is not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${GOOGLE_TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode,
            name: voiceName,
          },
          audioConfig: {
            audioEncoding: 'MP3',
            sampleRateHertz: 24000,
            speakingRate: 0.95,
            pitch: 0,
            effectsProfileId: ['headphone-class-device'],
          },
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`Google TTS request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `Google TTS HTTP ${response.status}: ${bodyText.slice(0, 500) || response.statusText}`
      );
    }

    const data = (await response.json()) as GoogleTtsResponse;
    if (data.error) {
      throw new Error(`Google TTS error: ${data.error.status} — ${data.error.message}`);
    }
    if (!data.audioContent) {
      throw new Error('Google TTS returned empty audioContent');
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');

    // 3. Upload to R2.
    const folder = source_type === 'dictionary_headword' ? 'dictionary' : source_type;
    const key = `${folder}/${accent}/${sourceTextHash}.mp3`;
    const audioUrl = await uploadAudio(key, audioBuffer);

    // 4. Persist cache row (idempotent — concurrent writers OK).
    await pool.query(
      `INSERT INTO tts_cache
         (source_text_hash, accent, voice_name, audio_url, char_count, source_type, source_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_text_hash, accent, voice_name) DO NOTHING`,
      [sourceTextHash, accent, voiceName, audioUrl, text.length, source_type, source_id ?? null]
    );

    return {
      audio_url: audioUrl,
      cached: false,
      char_count: text.length,
    };
  } catch (err: any) {
    console.error('[tts] generateAudio failed', {
      text_length: text.length,
      accent,
      source_type,
      source_id: source_id ?? null,
      error: err?.message ?? String(err),
    });
    throw err;
  }
}
