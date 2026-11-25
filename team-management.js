import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "./db.js";
import { authenticate } from "./auth.js";
import { requirePermission, ROLE_PERMISSIONS } from "./permissions.js";

const VALID_ROLES = new Set(["admin", "manager", "sales", "viewer"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ownerOnly(req, res, next) {
  if (req.user?.role !== "owner") {
    return res.status(403).json({
      error: "Only the business owner can perform this action."
    });
  }
  return next();
}

async function requireBusinessPlan(req, res, next) {
  // Paid-plan enforcement remains active outside explicit free testing mode.
  if (process.env.FREE_TESTING_MODE === "true") return next();

  try {
    const result = await pool.query(
      `SELECT s.plan, s.status, s.trial_ends_at, s.current_period_end
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       JOIN business_memberships bm ON bm.user_id = u.id
       WHERE bm.business_id = $1 AND u.role = 'owner'
       ORDER BY u.created_at ASC LIMIT 1`,
      [req.user.businessId]
    );

    const sub = result.rows[0];
    const now = Date.now();
    const trialEnd = sub?.trial_ends_at
      ? new Date(sub.trial_ends_at).getTime()
      : 0;
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end).getTime()
      : null;

    const active =
      sub?.status === "active" &&
      (periodEnd === null ||
        (Number.isFinite(periodEnd) && periodEnd > now));

    const trialing =
      sub?.status === "trialing" &&
      Number.isFinite(trialEnd) &&
      trialEnd > now;

    const grace =
      ["canceled", "past_due"].includes(sub?.status) &&
      periodEnd !== null &&
      Number.isFinite(periodEnd) &&
      periodEnd > now;

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
    return res.status(500).json({
      error: "Unable to verify team access."
    });
  }
}

export function registerTeamRoutes(app) {
  app.get(
    "/api/team/permissions",
    authenticate,
    requireBusinessPlan,
    async (req, res) => {
      const labels = {
        owner: "Owner",
        admin: "Admin",
        manager: "Manager",
        sales: "Sales",
        viewer: "Viewer"
      };

      return res.json({
        currentUserRole: req.user.role || "owner",
        roles: Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
          role,
          label: labels[role],
          permissions: [...permissions]
        }))
      });
    }
  );

  // Team visibility is controlled by the team:view permission.
  app.get(
    "/api/team/members",
    authenticate,
    requireBusinessPlan,
    requirePermission("team:view"),
    async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at
           FROM users u
           JOIN business_memberships bm ON bm.user_id = u.id
           WHERE bm.business_id = $1
           ORDER BY
             CASE WHEN u.role = 'owner' THEN 0 ELSE 1 END,
             u.created_at ASC`,
          [req.user.businessId]
        );

        return res.json({
          members: result.rows,
          currentUserRole: req.user.role
        });
      } catch (error) {
        console.error("Team list error:", error);
        return res.status(500).json({
          error: "Could not load team members."
        });
      }
    }
  );

  // Only the owner can create employee accounts.
  app.post(
    "/api/team/members",
    authenticate,
    requireBusinessPlan,
    ownerOnly,
    async (req, res) => {
      try {
        const name = String(req.body?.name || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        const role = String(req.body?.role || "sales").trim().toLowerCase();

        if (!name || !email || !password) {
          return res.status(400).json({
            error: "Name, email and temporary password are required."
          });
        }

        if (name.length > 100 || email.length > 254) {
          return res.status(400).json({
            error: "Name or email is too long."
          });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({
            error: "Enter a valid email address."
          });
        }

        if (password.length < 8 || password.length > 128) {
          return res.status(400).json({
            error: "Temporary password must be 8 to 128 characters."
          });
        }

        if (!VALID_ROLES.has(role)) {
          return res.status(400).json({
            error: "Invalid employee role."
          });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
          `INSERT INTO users
            (id, business_id, name, email, password_hash,
             email_verified, role, is_active, token_version)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6, TRUE, 0)
           RETURNING id, name, email, role, is_active, created_at`,
          [
            crypto.randomUUID(),
            req.user.businessId,
            name,
            email,
            passwordHash,
            role
          ]
        );

        await pool.query(
          `INSERT INTO business_memberships (user_id, business_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [result.rows[0].id, req.user.businessId]
        );

        return res.status(201).json({
          success: true,
          member: result.rows[0]
        });
      } catch (error) {
        if (error.code === "23505") {
          return res.status(409).json({
            error: "An account with this email already exists."
          });
        }

        console.error("Team member creation error:", error);
        return res.status(500).json({
          error: "Could not create employee account."
        });
      }
    }
  );

  // Only the owner can change an employee's role or active status.
  app.patch(
    "/api/team/members/:id",
    authenticate,
    requireBusinessPlan,
    ownerOnly,
    async (req, res) => {
      try {
        const memberId = String(req.params.id || "");
        if (!UUID_RE.test(memberId)) {
          return res.status(400).json({
            error: "Invalid employee ID."
          });
        }

        if (memberId === req.user.id) {
          return res.status(400).json({
            error: "You cannot change your own owner account here."
          });
        }

        const hasRole = Object.prototype.hasOwnProperty.call(
          req.body || {},
          "role"
        );
        const hasActive = Object.prototype.hasOwnProperty.call(
          req.body || {},
          "is_active"
        );

        if (!hasRole && !hasActive) {
          return res.status(400).json({
            error: "Provide role or is_active to update."
          });
        }

        let role = null;
        let isActive = null;

        if (hasRole) {
          role = String(req.body.role || "").trim().toLowerCase();
          if (!VALID_ROLES.has(role)) {
            return res.status(400).json({
              error: "Invalid employee role."
            });
          }
        }

        if (hasActive) {
          if (typeof req.body.is_active !== "boolean") {
            return res.status(400).json({
              error: "is_active must be true or false."
            });
          }
          isActive = req.body.is_active;
        }

        const result = await pool.query(
          `UPDATE users
           SET role = COALESCE($3, role),
               is_active = COALESCE($4, is_active),
               token_version = token_version + 1
           WHERE id = $1
             AND role <> 'owner'
             AND EXISTS (
               SELECT 1 FROM business_memberships bm
               WHERE bm.user_id = users.id
                 AND bm.business_id = $2
             )
           RETURNING id, name, email, role, is_active, created_at`,
          [memberId, req.user.businessId, role, isActive]
        );

        if (!result.rows.length) {
          return res.status(404).json({
            error: "Employee not found in your business."
          });
        }

        return res.json({
          success: true,
          member: result.rows[0],
          sessionRevoked: true
        });
      } catch (error) {
        console.error("Team member update error:", error);
        return res.status(500).json({
          error: "Could not update employee."
        });
      }
    }
  );
}
