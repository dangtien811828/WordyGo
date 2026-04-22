import { createHash } from 'crypto';
import pool from '../config/db';

export interface TranslateResult {
  translated_text: string | null;
  source: 'cached' | 'fresh' | 'unavailable';
  error?: string;
}

interface GoogleTranslateResponse {
  data: {
    translations: Array<{ translatedText: string }>;
  };
}

function buildHash(text: string, sourceLang: string, targetLang: string): string {
  return createHash('sha256')
    .update(`${sourceLang}:${targetLang}:${text}`)
    .digest('hex');
}

export async function translateText(
  text: string,
  sourceLang = 'en',
  targetLang = 'vi'
): Promise<TranslateResult> {
  const hash = buildHash(text, sourceLang, targetLang);

  // Check cache first
  const { rows } = await pool.query<{ translated_text: string }>(
    `SELECT translated_text FROM translation_cache WHERE source_hash = $1`,
    [hash]
  );

  if (rows.length > 0) {
    return { translated_text: rows[0].translated_text, source: 'cached' };
  }

  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return {
      translated_text: null,
      source: 'unavailable',
      error: 'TRANSLATION_API_NOT_CONFIGURED',
    };
  }

  // Call Google Translate REST API
  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: sourceLang, target: targetLang, format: 'text' }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Translate API error: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GoogleTranslateResponse;
  const translated = payload?.data?.translations?.[0]?.translatedText;

  if (!translated) {
    throw new Error('Unexpected response shape from Google Translate');
  }

  // Save to cache (ignore conflict — concurrent requests may race)
  await pool.query(
    `INSERT INTO translation_cache (source_hash, source_text, translated_text, source_lang, target_lang)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_hash) DO NOTHING`,
    [hash, text, translated, sourceLang, targetLang]
  );

  return { translated_text: translated, source: 'fresh' };
}
