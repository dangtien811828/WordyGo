import pool from '../config/db';

const PaymentMethod = {
  async findAll() {
    const { rows } = await pool.query(
      `SELECT * FROM payment_methods ORDER BY sort_order ASC, created_at ASC`
    );
    return rows;
  },

  async findActive() {
    const { rows } = await pool.query(
      `SELECT * FROM payment_methods WHERE is_active = TRUE ORDER BY sort_order ASC`
    );
    return rows;
  },

  async findById(id: string) {
    const { rows } = await pool.query(
      `SELECT * FROM payment_methods WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByCode(code: string) {
    const { rows } = await pool.query(
      `SELECT * FROM payment_methods WHERE code = $1`,
      [code]
    );
    return rows[0] || null;
  },

  async create(data: any) {
    const { rows } = await pool.query(
      `INSERT INTO payment_methods
         (code, display_name, description, logo_url, method_type, account_info,
          instructions_vi, instructions_en, fee_percent, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.code,
        data.display_name,
        data.description || null,
        data.logo_url || null,
        data.method_type,
        data.account_info ? JSON.stringify(data.account_info) : null,
        data.instructions_vi || null,
        data.instructions_en || null,
        parseFloat(data.fee_percent) || 0,
        data.is_active !== false,
        parseInt(data.sort_order) || 0,
      ]
    );
    return rows[0];
  },

  async update(id: string, data: any) {
    const { rows } = await pool.query(
      `UPDATE payment_methods SET
         display_name    = $1,
         description     = $2,
         logo_url        = $3,
         method_type     = $4,
         account_info    = $5,
         instructions_vi = $6,
         instructions_en = $7,
         fee_percent     = $8,
         is_active       = $9,
         sort_order      = $10,
         updated_at      = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        data.display_name,
        data.description || null,
        data.logo_url || null,
        data.method_type,
        data.account_info ? JSON.stringify(data.account_info) : null,
        data.instructions_vi || null,
        data.instructions_en || null,
        parseFloat(data.fee_percent) || 0,
        data.is_active !== false,
        parseInt(data.sort_order) || 0,
        id,
      ]
    );
    return rows[0] || null;
  },

  async delete(id: string) {
    await pool.query(`DELETE FROM payment_methods WHERE id = $1`, [id]);
  },

  async toggleActive(id: string) {
    const { rows } = await pool.query(
      `UPDATE payment_methods
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  async getByPlan(planId: string) {
    const { rows } = await pool.query(
      `SELECT pm.*
       FROM payment_methods pm
       JOIN plan_payment_methods ppm ON ppm.payment_method_id = pm.id
       WHERE ppm.plan_id = $1
       ORDER BY pm.sort_order ASC`,
      [planId]
    );
    return rows;
  },
};

export = PaymentMethod;
