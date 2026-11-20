import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "./db.js";
import { authenticate } from "./auth.js";

const VALID_ROLES = new Set(["admin", "manager", "sales", "viewer"]);

function ownerOnly(req, res, next) {
  if (req.user?.role !== "owner") {
    return res.status(403).json({ error: "Only the business owner can perform this action." });
  }
  return next();
}

function teamAdmin(req, res, next) {
  if (!["owner", "admin"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Team management permission required." });
  }
  return next();
}

async function requireBusinessPlan(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT s.plan, s.status, s.trial_ends_at, s.current_period_end
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE u.business_id = $1 AND u.role = 'owner'
       ORDER BY u.created_at ASC LIMIT 1`,
      [req.user.businessId]
    );

    const sub = result.rows[0];
    const now = Date.now();
    const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;

    const active = sub?.status === "active" && (periodEnd === null || (Number.isFinite(periodEnd) && periodEnd > now));
    const trialing = sub?.status === "trialing" && Number.isFinite(trialEnd) && trialEnd > now;
    const grace = ["canceled", "past_due"].includes(sub?.status) && periodEnd !== null && Number.isFinite(periodEnd) && periodEnd > now;

    if (!(active || trialing || grace) || sub?.plan !== "business") {
      return res.status(403).json({
        error: "Team Management requires the Business plan.",
        currentPlan: sub?.plan || "free",
        upgradeRequired: true
      });
    }

    return next();
  } catch (error) {
    console.error("Team plan check failed:", error);
    return res.status(500).json({ error: "Unable to verify team access." });
  }
}

export function registerTeamRoutes(app) {
  app.get("/api/team/members", authenticate, requireBusinessPlan, teamAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, email, role, is_active, created_at FROM users WHERE business_id = $1 ORDER BY created_at ASC`,
        [req.user.businessId]
      );
      return res.json({ members: result.rows });
    } catch (error) {
      console.error("Team list error:", error);
      return res.status(500).json({ error: "Could not load team members." });
    }
  });

  app.post("/api/team/members", authenticate, requireBusinessPlan, ownerOnly, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const role = String(req.body?.role || "sales").trim().toLowerCase();

      if (!name || !email || !password) {
        return res.status(400).json({ error: "Valid name, email and temporary password are required." });
      }
      if (!VALID_ROLES.has(role)) {
        return res.status(400).json({ error: "Invalid employee role." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (id, business_id, name, email, password_hash, email_verified, role, is_active, token_version)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, TRUE, 0)
         RETURNING id, name, email, role, is_active, created_at`,
        [crypto.randomUUID(), req.user.businessId, name, email, passwordHash, role]
      );

      return res.status(201).json({ member: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      console.error("Team member creation error:", error);
      return res.status(500).json({ error: "Could not create employee account." });
    }
  });
}
