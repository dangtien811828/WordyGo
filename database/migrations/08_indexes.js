/**
 * Indexes — tối ưu performance cho các query quan trọng
 */
module.exports = async (client) => {
  const indexes = [
    // Domain 2: Dictionary
    'CREATE INDEX IF NOT EXISTS idx_dict_headword ON dictionary_entries(headword)',
    'CREATE INDEX IF NOT EXISTS idx_dict_lemma ON dictionary_entries(lemma)',
    'CREATE INDEX IF NOT EXISTS idx_dict_source ON dictionary_entries(source)',
    'CREATE INDEX IF NOT EXISTS idx_dict_published ON dictionary_entries(published)',
    'CREATE INDEX IF NOT EXISTS idx_edit_history_entry ON entry_edit_history(entry_id)',
    'CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status)',
    'CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_lesson_progress(user_id)',

    // Domain 3: SRS (CRITICAL — query "cards cần ôn" chạy hàng triệu lần/ngày)
    'CREATE INDEX IF NOT EXISTS idx_ucp_user_due ON user_card_progress(user_id, due_at)',
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
  console.log(`  [✓] ${indexes.length} indexes`);
};
