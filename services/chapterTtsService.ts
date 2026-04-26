/**
 * Chapter TTS service — generates audio for every paragraph in a chapter,
 * with bounded parallelism (concurrency = 10) via p-limit.
 *
 * Designed to run as a fire-and-forget background task triggered by an admin endpoint:
 *   - The endpoint returns 202 immediately and does NOT await this function.
 *   - Progress is persisted to chapters.tts_progress / paragraphs.audio_status so the
 *     admin UI can poll status while generation runs.
 *
 * Failure semantics:
 *   - A single failed paragraph does NOT abort the chapter — failures are recorded per
 *     row so the admin can re-trigger to retry only the still-failed paragraphs.
 *   - If the function itself throws unexpectedly, chapter.tts_status is forced to
 *     'failed' so the UI never gets stuck on 'generating'.
 *   - Re-triggering on a chapter that finished as 'failed' resumes from where it left
 *     off (paragraphs already 'ready' are skipped but counted toward progress).
 */
import pool from '../config/db';
import pLimit from 'p-limit';
import { generateAudio, Accent } from './ttsService';

const CONCURRENCY = 10;

interface ParagraphRow {
  id: string;
  text: string;
  audio_status: 'none' | 'generating' | 'ready' | 'failed';
}

/**
 * Generate audio for every paragraph in a chapter, in parallel (concurrency = 10).
 *
 * Throws 'ALREADY_GENERATING' if the chapter is already mid-generation. Otherwise
 * the function never throws to the caller — internal errors are logged and recorded
 * on the chapter row.
 */
export async function generateChapterAudio(
  chapterId: string,
  accent: Accent = 'us'
): Promise<void> {
  // 1. Atomic claim: flip status to 'generating' only if not already generating.
  // Returning zero rows means another invocation already owns this chapter.
  const claim = await pool.query<{ id: string }>(
    `UPDATE chapters
        SET tts_status       = 'generating',
            tts_started_at   = NOW(),
            tts_progress     = 0,
            tts_completed_at = NULL
      WHERE id = $1 AND tts_status IS DISTINCT FROM 'generating'
      RETURNING id`,
    [chapterId]
  );

  if (claim.rows.length === 0) {
    // Either the chapter doesn't exist, or it's already generating.
    const exists = await pool.query<{ id: string }>(
      `SELECT id FROM chapters WHERE id = $1`,
      [chapterId]
    );
    if (exists.rows.length === 0) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
    throw new Error('ALREADY_GENERATING');
  }

  try {
    const { rows: paragraphs } = await pool.query<ParagraphRow>(
      `SELECT id, text, audio_status
         FROM paragraphs
        WHERE chapter_id = $1
        ORDER BY paragraph_index ASC`,
      [chapterId]
    );

    const total = paragraphs.length;

    if (total === 0) {
      await pool.query(
        `UPDATE chapters
            SET tts_status       = 'ready',
                tts_progress     = 100,
                tts_completed_at = NOW()
          WHERE id = $1`,
        [chapterId]
      );
      return;
    }

    // Counters mutated from inside the parallel workers. Single-threaded JS event
    // loop guarantees these increments are atomic — no locking needed.
    let completed = paragraphs.filter((p) => p.audio_status === 'ready').length;
    let readyCount = completed;
    let failedCount = 0;

    // Reflect the head-start from already-ready paragraphs immediately.
    await updateProgress(chapterId, completed, total);

    const limit = pLimit(CONCURRENCY);

    await Promise.all(
      paragraphs.map((para) =>
        limit(async () => {
          // Skip paragraphs already generated in a previous run. They were already
          // counted into `completed` above so progress reflects them.
          if (para.audio_status === 'ready') {
            return;
          }

          await pool.query(
            `UPDATE paragraphs
                SET audio_status = 'generating',
                    audio_error  = NULL
              WHERE id = $1`,
            [para.id]
          );

          try {
            const result = await generateAudio({
              text: para.text,
              accent,
              source_type: 'ebook_paragraph',
              source_id: para.id,
            });

            await pool.query(
              `UPDATE paragraphs
                  SET audio_url    = $1,
                      audio_status = 'ready',
                      audio_error  = NULL
                WHERE id = $2`,
              [result.audio_url, para.id]
            );
            readyCount += 1;
          } catch (err: any) {
            const errMsg = String(err?.message ?? err).slice(0, 1000);
            await pool.query(
              `UPDATE paragraphs
                  SET audio_status = 'failed',
                      audio_error  = $1
                WHERE id = $2`,
              [errMsg, para.id]
            );
            failedCount += 1;
            console.error(
              `[chapter-tts] paragraph ${para.id} (chapter ${chapterId}) failed: ${errMsg}`
            );
          }

          completed += 1;
          await updateProgress(chapterId, completed, total);
        })
      )
    );

    const allReady = readyCount === total && failedCount === 0;
    await pool.query(
      `UPDATE chapters
          SET tts_status       = $1,
              tts_progress     = $2,
              tts_completed_at = NOW()
        WHERE id = $3`,
      [
        allReady ? 'ready' : 'failed',
        allReady ? 100 : Math.floor((readyCount / total) * 100),
        chapterId,
      ]
    );
  } catch (err: any) {
    // Defensive: never leave the chapter stuck in 'generating' on unexpected crashes.
    console.error(`[chapter-tts] chapter ${chapterId} aborted unexpectedly:`, err);
    await pool
      .query(
        `UPDATE chapters
            SET tts_status       = 'failed',
                tts_completed_at = NOW()
          WHERE id = $1`,
        [chapterId]
      )
      .catch((markErr) =>
        console.error(`[chapter-tts] failed to mark chapter ${chapterId} as failed:`, markErr)
      );
  }
}

async function updateProgress(chapterId: string, completed: number, total: number): Promise<void> {
  const pct = total === 0 ? 0 : Math.min(100, Math.floor((completed / total) * 100));
  await pool.query(
    `UPDATE chapters SET tts_progress = $1 WHERE id = $2`,
    [pct, chapterId]
  );
}
