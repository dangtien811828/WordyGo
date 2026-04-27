/**
 * Shared SQL projection for the full dictionary entry shape (EntryDetail).
 * Consumed by:
 *   - routes/api/dictionary.ts (entries/:id, entries/by-headword/:headword)
 *   - routes/api/home.ts        (word-of-the-day)
 *
 * Caller appends WHERE/LIMIT clauses. The placeholder count matches whatever
 * the caller passes; this constant has no parameters of its own.
 */
export const FULL_ENTRY_SQL = `
  SELECT e.*,
    (SELECT json_agg(
       json_build_object(
         'id', s.id, 'pos', s.pos, 'sense_order', s.sense_order,
         'definition_en', s.definition_en, 'definition_vi', s.definition_vi,
         'register', s.register, 'domain', s.domain,
         'grammar_note', s.grammar_note, 'usage_note', s.usage_note, 'region', s.region,
         'examples', (SELECT json_agg(
             json_build_object('example_en', ex.example_en, 'example_vi', ex.example_vi, 'source', ex.source)
             ORDER BY ex.sort_order
           ) FROM sense_examples ex WHERE ex.sense_id = s.id),
         'synonyms', (SELECT json_agg(ss.synonym_text) FROM sense_synonyms ss WHERE ss.sense_id = s.id),
         'antonyms', (SELECT json_agg(sa.antonym_text) FROM sense_antonyms sa WHERE sa.sense_id = s.id)
       ) ORDER BY s.sense_order
     ) FROM entry_senses s WHERE s.entry_id = e.id) AS senses,
    (SELECT json_agg(
       json_build_object(
         'id', wf.id, 'form_type', wf.form_type, 'form_value', wf.form_value,
         'ipa', wf.ipa, 'audio_url', wf.audio_url, 'tags', wf.tags
       ) ORDER BY wf.sort_order
     ) FROM word_forms wf WHERE wf.entry_id = e.id) AS word_forms,
    (SELECT json_agg(
       json_build_object(
         'id', pv.id, 'phrasal_verb', pv.phrasal_verb, 'particle', pv.particle,
         'is_separable', pv.is_separable, 'definition_en', pv.definition_en,
         'definition_vi', pv.definition_vi, 'example_en', pv.example_en, 'example_vi', pv.example_vi
       )
     ) FROM phrasal_verbs pv WHERE pv.entry_id = e.id) AS phrasal_verbs,
    (SELECT json_agg(
       json_build_object(
         'id', idi.id, 'idiom_text', idi.idiom_text,
         'definition_en', idi.definition_en, 'definition_vi', idi.definition_vi,
         'example_en', idi.example_en, 'example_vi', idi.example_vi, 'register', idi.register
       )
     ) FROM entry_idioms idi WHERE idi.entry_id = e.id) AS idioms,
    (SELECT json_agg(
       json_build_object(
         'id', col.id, 'sense_id', col.sense_id, 'collocation', col.collocation,
         'pattern', col.pattern, 'example_en', col.example_en, 'example_vi', col.example_vi,
         'frequency', col.frequency
       )
     ) FROM collocations col WHERE col.entry_id = e.id) AS collocations,
    (SELECT json_agg(t.name ORDER BY t.name)
     FROM entry_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.entry_id = e.id) AS tags,
    (SELECT json_agg(
       json_build_object('id', d.id, 'headword', d.headword)
     )
     FROM entry_synonyms es JOIN dictionary_entries d ON d.id = es.synonym_id
     WHERE es.entry_id = e.id) AS legacy_synonyms,
    (SELECT json_agg(
       json_build_object('id', d.id, 'headword', d.headword)
     )
     FROM entry_antonyms ea JOIN dictionary_entries d ON d.id = ea.antonym_id
     WHERE ea.entry_id = e.id) AS legacy_antonyms,
    (SELECT json_build_object(
       'family_root', wf.family_root,
       'members', (SELECT json_agg(
          json_build_object('entry_id', m.entry_id, 'headword', de.headword, 'relation', m.relation)
        ) FROM word_family_members m
          JOIN dictionary_entries de ON de.id = m.entry_id
          WHERE m.family_id = wf.id AND m.entry_id != e.id)
     )
     FROM word_family_members wfm
     JOIN word_families wf ON wf.id = wfm.family_id
     WHERE wfm.entry_id = e.id
     LIMIT 1) AS word_family
  FROM dictionary_entries e
`;
