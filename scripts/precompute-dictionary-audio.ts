/**
 * Precompute Google TTS audio for every dictionary entry (US + UK).
 *
 * Usage:
 *   npm run precompute-audio -- --dry-run    # estimate cost, no API calls
 *   npm run precompute-audio                 # run for real
 *   npm run precompute-audio -- --resume     # continue from checkpoint
 *
 * Resumable: a checkpoint file is written after every successful entry, so
 * Ctrl+C followed by `--resume` picks up where it left off.
 *
 * Aborts after 5 consecutive failures to prevent burning quota on a misconfig.
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import pool from '../config/db';
import { generateAudio } from '../services/ttsService';

const CHECKPOINT_FILE = path.join(__dirname, 'precompute-checkpoint.json');
const BATCH_SIZE = 100;
const SLEEP_MS = 100;                  // ~10 req/sec per accent
const MAX_CONSECUTIVE_ERRORS = 5;
const GOOGLE_TTS_USD_PER_MILLION = 16; // Neural2 voice pricing

interface Checkpoint {
  last_processed_id: string | null;
  total_processed: number;
  total_chars: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    const raw = await fs.readFile(CHECKPOINT_FILE, 'utf8');
    return JSON.parse(raw) as Checkpoint;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { last_processed_id: null, total_processed: 0, total_chars: 0 };
    }
    throw err;
  }
}

async function saveCheckpoint(cp: Checkpoint): Promise<void> {
  await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(cp, null, 2), 'utf8');
}

async function checkpointExists(): Promise<boolean> {
  try {
    await fs.access(CHECKPOINT_FILE);
    return true;
  } catch {
    return false;
  }
}

function estimateCostUsd(totalChars: number): string {
  return ((totalChars * GOOGLE_TTS_USD_PER_MILLION) / 1_000_000).toFixed(2);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const resume = process.argv.includes('--resume');

  let checkpoint: Checkpoint;
  if (resume) {
    checkpoint = await loadCheckpoint();
    console.log(
      `[resume] last_processed_id=${checkpoint.last_processed_id ?? '(none)'}, ` +
        `total_processed=${checkpoint.total_processed}, total_chars=${checkpoint.total_chars}`
    );
  } else {
    if (await checkpointExists()) {
      console.log(
        '[warn] checkpoint file exists. Pass --resume to continue, or delete the file to start over.'
      );
    }
    checkpoint = { last_processed_id: null, total_processed: 0, total_chars: 0 };
  }

  if (dryRun) {
    console.log('[dry-run] No API calls or DB updates will be made.\n');
  }

  const startId = checkpoint.last_processed_id ?? '00000000-0000-0000-0000-000000000000';
  let lastId = startId;
  let consecutiveErrors = 0;

  while (true) {
    const { rows: entries } = await pool.query<{ id: string; headword: string }>(
      `SELECT id, headword
         FROM dictionary_entries
        WHERE id > $1
        ORDER BY id
        LIMIT $2`,
      [lastId, BATCH_SIZE]
    );

    if (entries.length === 0) break;

    for (const entry of entries) {
      try {
        if (!dryRun) {
          const us = await generateAudio({
            text: entry.headword,
            accent: 'us',
            source_type: 'dictionary_headword',
            source_id: entry.id,
          });
          await pool.query(
            `UPDATE dictionary_entries SET audio_us_url = $1 WHERE id = $2`,
            [us.audio_url, entry.id]
          );
          await sleep(SLEEP_MS);

          const uk = await generateAudio({
            text: entry.headword,
            accent: 'uk',
            source_type: 'dictionary_headword',
            source_id: entry.id,
          });
          await pool.query(
            `UPDATE dictionary_entries SET audio_uk_url = $1 WHERE id = $2`,
            [uk.audio_url, entry.id]
          );
          await sleep(SLEEP_MS);
        }

        checkpoint.last_processed_id = entry.id;
        checkpoint.total_processed += 1;
        checkpoint.total_chars += entry.headword.length * 2; // us + uk
        await saveCheckpoint(checkpoint);
        consecutiveErrors = 0;
      } catch (err: any) {
        console.error(
          `[fail] entry ${entry.id} (${entry.headword}): ${err?.message ?? String(err)}`
        );
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            `[abort] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — exiting. ` +
              `Run with --resume after fixing the issue.`
          );
          process.exit(1);
        }
      }

      lastId = entry.id;
    }

    console.log(
      `Processed: ${checkpoint.total_processed} | ` +
        `Chars: ${checkpoint.total_chars} | ` +
        `Est cost: $${estimateCostUsd(checkpoint.total_chars)}` +
        `${dryRun ? ' [dry-run]' : ''}`
    );
  }

  console.log(
    `\nDone! Total processed: ${checkpoint.total_processed}, ` +
      `total chars: ${checkpoint.total_chars}, ` +
      `est cost: $${estimateCostUsd(checkpoint.total_chars)}` +
      `${dryRun ? ' [dry-run]' : ''}`
  );
}

main()
  .catch((err) => {
    console.error('[fatal]', err);
    process.exit(1);
  })
  .finally(() => pool.end());
