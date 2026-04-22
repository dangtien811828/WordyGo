import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  // Drop SRS columns that belonged to the old Leitner-on-UCP design
  const dropCols = [
    'leitner_box', 'ease', 'review_interval',
    'due_at', 'stability', 'lapses',
  ];
  for (const col of dropCols) {
    await client.query(
      `ALTER TABLE user_card_progress DROP COLUMN IF EXISTS ${col}`
    );
  }

  // Add lightweight progress tracking columns
  await client.query(`
    ALTER TABLE user_card_progress
      ADD COLUMN IF NOT EXISTS first_seen_at  timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS times_seen     int         DEFAULT 0,
      ADD COLUMN IF NOT EXISTS times_correct  int         DEFAULT 0
  `);

  console.log('  [✓] user_card_progress: SRS columns dropped, times_seen/correct added');
};

export = migration;
