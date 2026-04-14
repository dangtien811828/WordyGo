module.exports = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      requester_id  UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
      action        VARCHAR(20) NOT NULL CHECK (action IN ('create','update','delete')),
      module        VARCHAR(30) NOT NULL,
      target_type   VARCHAR(50),
      target_id     UUID,
      payload       JSONB NOT NULL DEFAULT '{}',
      status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
      reviewer_id   UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      reviewer_note TEXT,
      reviewed_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] approval_requests');
};

export {};
