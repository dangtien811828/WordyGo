/**
 * Phase 7.2: Add 'pending_payment' status to user_subscriptions
 * Dynamically finds and replaces the status CHECK constraint.
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {

  // Find and drop the existing status check constraint on user_subscriptions
  await client.query(`
    DO $$
    DECLARE
      v_name text;
    BEGIN
      SELECT con.conname INTO v_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'user_subscriptions'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%status%';

      IF v_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE user_subscriptions DROP CONSTRAINT ' || quote_ident(v_name);
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE user_subscriptions
      ADD CONSTRAINT user_subscriptions_status_check
      CHECK (status IN ('active','expired','cancelled','trial','pending_payment'));
  `);
  console.log('  [✓] user_subscriptions.status: added pending_payment');
};

export = migration;
