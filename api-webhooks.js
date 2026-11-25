import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import pool from "./db.js";
import { authenticate } from "./auth.js";
import { requirePermission } from "./permissions.js";
import { runLeadCreatedAutomations } from "./automation.js";
import { rateLimit } from "express-rate-limit";

const scrypt = promisify(crypto.scrypt);
const API_KEY_PREFIX = "vpk_live_";
const ALLOWED_SCOPES = ["leads:read", "leads:write"];
const ALLOWED_EVENTS = ["lead.created"];
const MAX_ATTEMPTS = 5;
let workerStarted = false;

function encryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters for webhook encryption.");
  }
  return crypto.scryptSync(secret, "vikop-api-webhooks-v1", 32);
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString("base64url")).join(".");
}

function decryptSecret(value) {
  const [iv, tag, encrypted] = String(value).split(".").map(v => Buffer.from(v, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted webhook secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const p = address.split(".").map(Number);
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 192 && b === 0 && p[2] === 2) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0 && p[2] === 113) return false;
    return true;
  }

  if (net.isIP(address) === 6) {
    const ip = address.toLowerCase();
    if (ip.startsWith("::ffff:")) return isPublicAddress(ip.slice(7));
    const secondGroup = ip.split(":")[1] || "0";
    const secondValue = parseInt(secondGroup || "0", 16);

    if (ip === "::" || ip === "::1" || ip.startsWith("fc") ||
        ip.startsWith("fd") || ip.startsWith("fe8") ||
        ip.startsWith("fe9") || ip.startsWith("fea") ||
        ip.startsWith("feb") || ip.startsWith("ff") ||
        (ip.startsWith("2001:") && parseInt(ip.split(":")[1] || "0", 16) === 0x0db8) ||
        (ip.startsWith("2001:") && secondValue <= 0x01ff) ||
        ip.startsWith("2002:") ||
        (ip.startsWith("3fff:") && secondValue <= 0x0fff)) return false;

    return /^2[0-9a-f]{3}:|^3[0-9a-f]{3}:/i.test(ip);
  }
  return false;
}

async function validateWebhookUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); }
  catch { throw new Error("Enter a valid HTTPS webhook URL."); }

  if (url.protocol !== "https:" || url.username || url.password ||
      !url.hostname || url.port && Number(url.port) !== 443) {
    throw new Error("Webhook URL must use HTTPS on the standard port, without credentials.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error("Private or local webhook addresses are blocked.");
    return { url, addresses: [{ address: hostname, family: net.isIP(hostname) }] };
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error("Webhook host resolves to a private or restricted network address.");
  }
  return { url, addresses };
}

function sendSignedWebhook(endpoint, secret, eventId, eventType, payload) {
  return new Promise(async (resolve, reject) => {
    try {
      const { url, addresses } = await validateWebhookUrl(endpoint);
      const body = Buffer.from(JSON.stringify(payload));
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = crypto.createHmac("sha256", secret)
        .update(`${timestamp}.${body.toString("utf8")}`).digest("hex");

      const options = {
        method: "POST",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          "User-Agent": "VikoP-Webhooks/1.0",
          "X-VikoP-Event": eventType,
          "X-VikoP-Event-Id": eventId,
          "X-VikoP-Timestamp": timestamp,
          "X-VikoP-Signature": `sha256=${signature}`
        },
        lookup: (_hostname, _options, callback) => {
          const chosen = addresses[0];
          callback(null, chosen.address, chosen.family);
        }
      };

      const request = https.request(options, response => {
        let responseBody = "";
        response.on("data", chunk => {
          if (responseBody.length < 4000) responseBody += chunk.toString();
        });
        response.on("end", () => resolve({
          status: response.statusCode || 0,
          body: responseBody.slice(0, 4000)
        }));
      });
      request.on("timeout", () => request.destroy(new Error("Webhook request timed out.")));
      request.on("error", reject);
      request.end(body);
    } catch (error) {
      reject(error);
    }
  });
}

export async function initializeApiWebhookTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_api_keys (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      key_prefix VARCHAR(32) NOT NULL UNIQUE,
      key_hash CHAR(64) NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT ARRAY['leads:read']::text[],
      expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_business_api_keys_business
      ON business_api_keys(business_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS business_webhooks (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      endpoint_url TEXT NOT NULL,
      encrypted_secret TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT ARRAY['lead.created']::text[],
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_business_webhooks_active
      ON business_webhooks(business_id, is_active);

    CREATE TABLE IF NOT EXISTS business_webhook_deliveries (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      webhook_id UUID NOT NULL REFERENCES business_webhooks(id) ON DELETE CASCADE,
      event_id UUID NOT NULL,
      event_type VARCHAR(60) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','delivered','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      response_status INTEGER,
      response_body TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      sending_started_at TIMESTAMPTZ,
      UNIQUE(webhook_id, event_id)
    );

    ALTER TABLE business_webhook_deliveries
      ADD COLUMN IF NOT EXISTS sending_started_at TIMESTAMPTZ;

    UPDATE business_webhook_deliveries
      SET status = 'pending', next_attempt_at = NOW()
      WHERE status = 'sending' AND sending_started_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
      ON business_webhook_deliveries(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_business
      ON business_webhook_deliveries(business_id, created_at DESC);
  `);
}

async function apiKeyAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!key.startsWith(API_KEY_PREFIX) || key.length < 40) {
      return res.status(401).json({ error: "A valid VikoP API key is required." });
    }

    const prefix = key.slice(0, 20);
    const result = await pool.query(
      `SELECT id, business_id, scopes
       FROM business_api_keys
       WHERE key_prefix = $1 AND key_hash = $2
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [prefix, sha256(key)]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: "API key is invalid, expired or revoked." });
    }

    req.apiKey = result.rows[0];
    pool.query("UPDATE business_api_keys SET last_used_at = NOW() WHERE id = $1", [req.apiKey.id])
      .catch(() => {});
    next();
  } catch (error) {
    console.error("API key authentication error:", error.message);
    res.status(500).json({ error: "API authentication failed." });
  }
}

function requireApiScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey?.scopes?.includes(scope)) {
      return res.status(403).json({ error: `API key requires ${scope} scope.` });
    }
    next();
  };
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

function businessAdmin(req, res, next) {
  authenticate(req, res, error => {
    if (error) return next(error);
    requirePermission("api-webhooks:manage")(req, res, next);
  });
}

export function registerApiWebhookRoutes(app) {
  const admin = [authenticate, requirePermission("api-webhooks:manage")];

  app.get("/api/business/api-keys", ...admin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, key_prefix, scopes, expires_at, last_used_at, revoked_at, created_at
         FROM business_api_keys WHERE business_id = $1 ORDER BY created_at DESC`,
        [req.user.businessId]
      );
      res.json({ keys: result.rows });
    } catch (error) {
      console.error("API keys list error:", error.message);
      res.status(500).json({ error: "Could not load API keys." });
    }
  });

  app.post("/api/business/api-keys", ...admin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const scopes = [...new Set(Array.isArray(req.body?.scopes) ? req.body.scopes : [])];
      if (!name || name.length > 80) return res.status(400).json({ error: "Key name is required (maximum 80 characters)." });
      if (!scopes.length || scopes.some(scope => !ALLOWED_SCOPES.includes(scope))) {
        return res.status(400).json({ error: "Select valid API scopes." });
      }

      let expiresAt = null;
      if (req.body?.expiresInDays !== undefined && req.body.expiresInDays !== null) {
        const days = Number(req.body.expiresInDays);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
          return res.status(400).json({ error: "Expiry must be between 1 and 365 days." });
        }
        expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      }

      const rawKey = API_KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
      const id = randomUUID();
      const prefix = rawKey.slice(0, 20);
      await pool.query(
        `INSERT INTO business_api_keys
         (id,business_id,name,key_prefix,key_hash,scopes,expires_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, req.user.businessId, name, prefix, sha256(rawKey), scopes, expiresAt, req.user.id]
      );
      res.status(201).json({ key: { id, name, prefix, scopes, expires_at: expiresAt }, secret: rawKey });
    } catch (error) {
      console.error("API key create error:", error.message);
      res.status(500).json({ error: "Could not create API key." });
    }
  });

  app.delete("/api/business/api-keys/:id", ...admin, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE business_api_keys SET revoked_at = NOW()
         WHERE id = $1 AND business_id = $2 AND revoked_at IS NULL RETURNING id`,
        [req.params.id, req.user.businessId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "API key not found or already revoked." });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Could not revoke API key." });
    }
  });

  app.get("/api/business/webhooks", ...admin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, endpoint_url, events, is_active, created_at, updated_at
         FROM business_webhooks WHERE business_id = $1 ORDER BY created_at DESC`,
        [req.user.businessId]
      );
      res.json({ webhooks: result.rows });
    } catch (error) {
      res.status(500).json({ error: "Could not load webhooks." });
    }
  });

  app.post("/api/business/webhooks", ...admin, async (req, res) => {
    try {
      const { url } = await validateWebhookUrl(req.body?.endpointUrl);
      const events = [...new Set(Array.isArray(req.body?.events) ? req.body.events : [])];
      if (!events.length || events.some(event => !ALLOWED_EVENTS.includes(event))) {
        return res.status(400).json({ error: "Currently supported event: lead.created." });
      }
      const secret = "vpk_whsec_" + crypto.randomBytes(32).toString("base64url");
      const id = randomUUID();
      await pool.query(
        `INSERT INTO business_webhooks (id,business_id,endpoint_url,encrypted_secret,events)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, req.user.businessId, url.toString(), encryptSecret(secret), events]
      );
      res.status(201).json({
        webhook: { id, endpoint_url: url.toString(), events, is_active: true },
        secret
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not create webhook." });
    }
  });

  app.patch("/api/business/webhooks/:id", ...admin, async (req, res) => {
    try {
      if (typeof req.body?.isActive !== "boolean") {
        return res.status(400).json({ error: "isActive must be true or false." });
      }
      const result = await pool.query(
        `UPDATE business_webhooks SET is_active = $1, updated_at = NOW()
         WHERE id = $2 AND business_id = $3 RETURNING id,is_active`,
        [req.body.isActive, req.params.id, req.user.businessId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Webhook not found." });
      res.json({ webhook: result.rows[0] });
    } catch (error) {
      res.status(500).json({ error: "Could not update webhook." });
    }
  });

  app.delete("/api/business/webhooks/:id", ...admin, async (req, res) => {
    try {
      const result = await pool.query(
        "DELETE FROM business_webhooks WHERE id = $1 AND business_id = $2 RETURNING id",
        [req.params.id, req.user.businessId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Webhook not found." });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Could not delete webhook." });
    }
  });

  app.get("/api/business/webhook-deliveries", ...admin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT d.id,d.event_type,d.status,d.attempts,d.response_status,
                d.last_error,d.created_at,d.delivered_at,w.endpoint_url
         FROM business_webhook_deliveries d
         JOIN business_webhooks w ON w.id = d.webhook_id
         WHERE d.business_id = $1
         ORDER BY d.created_at DESC LIMIT 100`,
        [req.user.businessId]
      );
      res.json({ deliveries: result.rows });
    } catch (error) {
      res.status(500).json({ error: "Could not load webhook deliveries." });
    }
  });

  app.post("/api/business/webhook-deliveries/:id/retry", ...admin, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE business_webhook_deliveries d
         SET status = 'pending', attempts = 0, next_attempt_at = NOW(),
             last_error = NULL, response_status = NULL, response_body = NULL
         FROM business_webhooks w
         WHERE d.webhook_id = w.id AND d.id = $1
           AND d.business_id = $2 AND w.business_id = $2
           AND w.is_active = TRUE AND d.status = 'failed'
         RETURNING d.id`,
        [req.params.id, req.user.businessId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Delivery cannot be retried." });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Could not retry delivery." });
    }
  });

  app.get("/api/v1/leads", apiLimiter, apiKeyAuth, requireApiScope("leads:read"), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id,name,contact,status,notes,assigned_to,created_at,updated_at
         FROM leads WHERE business_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.apiKey.business_id]
      );
      res.json({ leads: result.rows });
    } catch (error) {
      res.status(500).json({ error: "Could not load leads." });
    }
  });

  app.post("/api/v1/leads", apiLimiter, apiKeyAuth, requireApiScope("leads:write"), async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const contact = String(req.body?.contact || "").trim();
      const notes = String(req.body?.notes || "").trim();
      if (!name || name.length > 160 || contact.length > 200 || notes.length > 3000) {
        return res.status(400).json({ error: "Provide a valid name, contact and notes." });
      }
      const id = randomUUID();
      const result = await pool.query(
        `INSERT INTO leads (id,business_id,name,contact,status,notes)
         VALUES ($1,$2,$3,$4,'new',$5)
         RETURNING id,name,contact,status,notes,assigned_to,created_at,updated_at`,
        [id, req.apiKey.business_id, name, contact || null, notes || null]
      );
      runLeadCreatedAutomations(req.apiKey.business_id, result.rows[0].id)
        .catch(error => console.error("API lead automation trigger failed:", error.message));
      dispatchLeadCreatedWebhooks(req.apiKey.business_id, result.rows[0])
        .catch(error => console.error("Webhook event enqueue error:", error.message));
      res.status(201).json({ lead: result.rows[0] });
    } catch (error) {
      console.error("Public Leads API error:", error.message);
      res.status(500).json({ error: "Could not create lead." });
    }
  });
}

export async function dispatchLeadCreatedWebhooks(businessId, lead) {
  const eventId = randomUUID();
  const payload = {
    id: eventId,
    type: "lead.created",
    created_at: new Date().toISOString(),
    data: lead
  };
  await pool.query(
    `INSERT INTO business_webhook_deliveries
     (id,business_id,webhook_id,event_id,event_type,payload)
     SELECT gen_random_uuid(), business_id, id, $2, 'lead.created', $3::jsonb
     FROM business_webhooks
     WHERE business_id = $1 AND is_active = TRUE
       AND events @> ARRAY['lead.created']::text[]
     ON CONFLICT (webhook_id,event_id) DO NOTHING`,
    [businessId, eventId, JSON.stringify(payload)]
  );
}

async function processWebhookDelivery() {
  await pool.query(
    `UPDATE business_webhook_deliveries
     SET status='failed', sending_started_at=NULL,
         last_error=COALESCE(last_error, 'Maximum delivery attempts reached after worker recovery.')
     WHERE status='sending' AND attempts >= $1
       AND sending_started_at <= NOW() - INTERVAL '2 minutes'`,
    [MAX_ATTEMPTS]
  );

  const client = await pool.connect();
  let delivery;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT d.id,d.webhook_id,d.event_id,d.event_type,d.payload,
              w.endpoint_url,w.encrypted_secret
       FROM business_webhook_deliveries d
       JOIN business_webhooks w ON w.id = d.webhook_id
       WHERE (
           (d.status = 'pending' AND d.next_attempt_at <= NOW())
           OR
           (d.status = 'sending'
            AND d.attempts < $1
            AND d.sending_started_at <= NOW() - INTERVAL '2 minutes')
         )
         AND w.is_active = TRUE
       ORDER BY d.next_attempt_at ASC
       LIMIT 1
       FOR UPDATE OF d SKIP LOCKED`,
      [MAX_ATTEMPTS]
    );
    if (!result.rows.length) {
      await client.query("COMMIT");
      return;
    }
    delivery = result.rows[0];
    await client.query(
      `UPDATE business_webhook_deliveries
       SET status = 'sending', attempts = attempts + 1,
           sending_started_at = NOW()
       WHERE id = $1`,
      [delivery.id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const attemptResult = await pool.query(
    "SELECT attempts FROM business_webhook_deliveries WHERE id = $1",
    [delivery.id]
  );
  const attempt = attemptResult.rows[0]?.attempts || 1;

  try {
    const secret = decryptSecret(delivery.encrypted_secret);
    const response = await sendSignedWebhook(
      delivery.endpoint_url, secret, delivery.event_id,
      delivery.event_type, delivery.payload
    );
    if (response.status >= 200 && response.status < 300) {
      await pool.query(
        `UPDATE business_webhook_deliveries
         SET status='delivered',response_status=$2,response_body=$3,
             last_error=NULL,delivered_at=NOW(),sending_started_at=NULL
         WHERE id=$1`,
        [delivery.id, response.status, response.body]
      );
    } else {
      throw new Error(`Webhook returned HTTP ${response.status}: ${response.body}`);
    }
  } catch (error) {
    const failed = attempt >= MAX_ATTEMPTS;
    const delays = [60, 300, 1800, 7200, 43200];
    await pool.query(
      `UPDATE business_webhook_deliveries
       SET status=$2,next_attempt_at=NOW()+($3 * INTERVAL '1 second'),
           last_error=$4,sending_started_at=NULL
       WHERE id=$1`,
      [delivery.id, failed ? "failed" : "pending",
       delays[Math.min(attempt - 1, delays.length - 1)],
       String(error.message || "Delivery failed").slice(0, 1000)]
    );
  }
}

export function startWebhookDeliveryWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const timer = setInterval(() => {
    processWebhookDelivery().catch(error =>
      console.error("Webhook delivery worker error:", error.message)
    );
  }, 5000);
  timer.unref?.();
}
