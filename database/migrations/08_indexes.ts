/**
 * Indexes — performance-critical queries
 *
 * Updated: added indexes for cefr_level, frequency_rank, entry_synonyms, entry_antonyms
 *          added indexes for Dictionary Pro tables (senses, forms, idioms, phrasal verbs, collocations)
 * Fixed: review_interval (was interval)
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  const indexes: string[] = [
    // Domain 2: Dictionary (EXPANDED)
    'CREATE INDEX IF NOT EXISTS idx_dict_headword ON dictionary_entries(headword)',
    'CREATE INDEX IF NOT EXISTS idx_dict_lemma ON dictionary_entries(lemma)',
    'CREATE INDEX IF NOT EXISTS idx_dict_source ON dictionary_entries(source)',
    'CREATE INDEX IF NOT EXISTS idx_dict_published ON dictionary_entries(published)',
    'CREATE INDEX IF NOT EXISTS idx_dict_cefr ON dictionary_entries(cefr_level)',
    'CREATE INDEX IF NOT EXISTS idx_dict_frequency ON dictionary_entries(frequency_rank)',
    'CREATE INDEX IF NOT EXISTS idx_edit_history_entry ON entry_edit_history(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status)',
    'CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_lesson_progress(user_id)',

    // Domain 2: Synonyms & Antonyms (NEW)
    'CREATE INDEX IF NOT EXISTS idx_synonyms_entry ON entry_synonyms(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_synonyms_synonym ON entry_synonyms(synonym_id)',
    'CREATE INDEX IF NOT EXISTS idx_antonyms_entry ON entry_antonyms(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_antonyms_antonym ON entry_antonyms(antonym_id)',

    // Domain 2: Dictionary Pro
    'CREATE INDEX IF NOT EXISTS idx_senses_entry ON entry_senses(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_senses_pos ON entry_senses(entry_id, pos)',
    'CREATE INDEX IF NOT EXISTS idx_sense_examples_sense ON sense_examples(sense_id)',
    'CREATE INDEX IF NOT EXISTS idx_word_forms_entry ON word_forms(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_word_forms_type ON word_forms(entry_id, form_type)',
    'CREATE INDEX IF NOT EXISTS idx_idioms_entry ON entry_idioms(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_phrasal_entry ON phrasal_verbs(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_collocations_entry ON collocations(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_collocations_sense ON collocations(sense_id)',
    'CREATE INDEX IF NOT EXISTS idx_sense_syn ON sense_synonyms(sense_id)',
    'CREATE INDEX IF NOT EXISTS idx_sense_ant ON sense_antonyms(sense_id)',
    'CREATE INDEX IF NOT EXISTS idx_family_members_entry ON word_family_members(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_family_members_family ON word_family_members(family_id)',

    // Domain 3: SRS
    // idx_ucp_user_due is handled separately below (due_at dropped in Phase 6 migration 17)
    'CREATE INDEX IF NOT EXISTS idx_ucp_card ON user_card_progress(card_id)',
    'CREATE INDEX IF NOT EXISTS idx_reviews_user_time ON reviews(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_reviews_card_time ON reviews(card_id, created_at)',

    // Domain 4: Retrieval
    'CREATE INDEX IF NOT EXISTS idx_retrieval_user ON retrieval_sessions(user_id, created_at)',

    // Domain 5: Ebook
    'CREATE INDEX IF NOT EXISTS idx_chapters_ebook ON chapters(ebook_id)',
    'CREATE INDEX IF NOT EXISTS idx_tts_chapter ON tts_cache(chapter_id)',
    'CREATE INDEX IF NOT EXISTS idx_reading_user ON user_reading_progress(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_lookups_entry ON word_lookups(entry_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_lookups_user ON word_lookups(user_id, created_at)',

    // Domain 6: Gaming
    'CREATE INDEX IF NOT EXISTS idx_game_runs_user ON game_runs(user_id, game_type, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_game_runs_score ON game_runs(game_type, score DESC)',

    // Domain 7: Commerce
    'CREATE INDEX IF NOT EXISTS idx_user_sub_status ON user_subscriptions(user_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at)',

    // Domain 8: AI
    'CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_logs(status, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_translation_hash ON translation_cache(source_hash)',
    'CREATE INDEX IF NOT EXISTS idx_batch_seq ON micro_delta_batches(seq)',

    // Domain 9: System
    'CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_notif_admin ON notifications(admin_id, is_read, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_log(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_activity_action ON user_activity_log(action, created_at)',
  ];

  for (const sql of indexes) {
    await client.query(sql);
  }

  // idx_ucp_user_due: only create if due_at column still exists.
  // Phase 6 (migration 17) drops this column; on fresh Railway deploys
  // migration 08 runs before 17, so due_at exists and the index is created.
  // On DBs already at Phase 6 schema, this block skips safely.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_card_progress' AND column_name = 'due_at'
      ) THEN
        CREATE INDEX IF NOT EXISTS idx_ucp_user_due
          ON user_card_progress(user_id, due_at);
      END IF;
    END $$
  `);

  console.log(`  [✓] ${indexes.length} indexes (+ conditional idx_ucp_user_due)`);
};

export = migration;
