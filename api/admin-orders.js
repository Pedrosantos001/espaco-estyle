// api/admin-orders.js (CommonJS)
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/, "");
    if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: "Unauthorized" });

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const client = await pool.connect();
    try {
      const { rows } = await client.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
      res.status(200).json({ orders: rows });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno" });
  }
};
