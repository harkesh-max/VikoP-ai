import crypto from "node:crypto";
import pool from "./db.js";
import { authenticate, createToken } from "./auth.js";

export function registerMultiBusinessRoutes(app) {
  app.get("/api/businesses", authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT b.id, b.name, b.industry, b.created_at,
                (b.id = $2) AS is_active
         FROM business_memberships bm
         JOIN businesses b ON b.id = bm.business_id
         WHERE bm.user_id = $1
         ORDER BY b.created_at ASC`,
        [req.user.id, req.user.businessId]
      );
      return res.json({ businesses: result.rows });
    } catch (error) {
      console.error("Business list error:", error);
      return res.status(500).json({ error: "Could not load businesses." });
    }
  });

  app.post("/api/businesses", authenticate, async (req, res) => {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can create businesses." });
    }

    const name = String(req.body?.name || "").trim();
    const industry = String(req.body?.industry || "").trim();

    if (!name || name.length > 100 || industry.length > 80) {
      return res.status(400).json({ error: "Enter a valid business name and industry." });
    }

    const client = await pool.connect();
    try {
      const businessId = crypto.randomUUID();
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO businesses (id, name, industry)
         VALUES ($1, $2, $3)
         RETURNING id, name, industry, created_at`,
        [businessId, name, industry || null]
      );

      await client.query(
        `INSERT INTO business_memberships (user_id, business_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.user.id, businessId]
      );

      await client.query("COMMIT");

      const userResult = await pool.query(
        `SELECT id, name, email, role, token_version
         FROM users WHERE id = $1`,
        [req.user.id]
      );
      const user = userResult.rows[0];
      const token = createToken(user, businessId);

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          businessId,
          businessName: result.rows[0].name
        },
        business: result.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Business creation error:", error);
      return res.status(500).json({ error: "Could not create business." });
    } finally {
      client.release();
    }
  });

  app.post("/api/businesses/:id/switch", authenticate, async (req, res) => {
    const businessId = req.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
      return res.status(400).json({ error: "Invalid business ID." });
    }

    try {
      const result = await pool.query(
        `SELECT b.id, b.name, b.industry, b.created_at
         FROM business_memberships bm
         JOIN businesses b ON b.id = bm.business_id
         WHERE bm.user_id = $1 AND bm.business_id = $2`,
        [req.user.id, businessId]
      );

      if (!result.rows.length) {
        return res.status(403).json({ error: "You do not have access to this business." });
      }

      const userResult = await pool.query(
        `SELECT id, name, email, role, token_version
         FROM users WHERE id = $1 AND is_active = TRUE`,
        [req.user.id]
      );
      if (!userResult.rows.length) {
        return res.status(401).json({ error: "Account is unavailable." });
      }

      const user = userResult.rows[0];
      return res.json({
        success: true,
        token: createToken(user, businessId),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          businessId,
          businessName: result.rows[0].name
        },
        business: result.rows[0]
      });
    } catch (error) {
      console.error("Business switch error:", error);
      return res.status(500).json({ error: "Could not switch business." });
    }
  });
}
