import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "./db.js";

function createId() {
  return crypto.randomUUID();
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      businessId: user.business_id
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function hashVerificationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendVerificationEmail({ to, name, token }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "VikoP AI";

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo email verification is not configured.");
  }

  const appUrl = (
    process.env.PUBLIC_APP_URL ||
    "https://vikop-ai.onrender.com"
  ).replace(/\/+$/, "");

  const verifyUrl =
    appUrl +
    "/api/auth/verify-email?token=" +
    encodeURIComponent(token);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{ email: to, name: name || undefined }],
      subject: "Verify your VikoP AI account",
      textContent:
        "Welcome to VikoP AI.\n\n" +
        "Please verify your email address using this link:\n" +
        verifyUrl +
        "\n\nThis link expires in 24 hours."
    })
  });

  if (!response.ok) {
    let details = "";

    try {
      const data = await response.json();
      details = data?.message || data?.code || "";
    } catch {}

    throw new Error(
      "Brevo email failed (" +
      response.status +
      ")" +
      (details ? ": " + details : "")
    );
  }
}

async function cleanupPendingAccount(userId, businessId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "DELETE FROM users WHERE id = $1",
      [userId]
    );

    await client.query(
      "DELETE FROM businesses WHERE id = $1",
      [businessId]
    );

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function verifyEmail(req, res) {
  try {
    const token =
      typeof req.query.token === "string"
        ? req.query.token.trim()
        : "";

    if (!token) {
      return res.status(400).type("html").send(
        "<h2>Invalid verification link</h2>"
      );
    }

    const tokenHash = hashVerificationToken(token);

    const result = await pool.query(
      "SELECT id FROM users WHERE verification_token_hash = $1 AND email_verified = FALSE AND verification_expires_at > NOW() LIMIT 1",
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).type("html").send(
        "<h2>Invalid or expired verification link</h2><p>Please request a new verification email.</p>"
      );
    }

    await pool.query(
      "UPDATE users SET email_verified = TRUE, verification_token_hash = NULL, verification_expires_at = NULL WHERE id = $1",
      [result.rows[0].id]
    );

    const appUrl = (
      process.env.PUBLIC_APP_URL ||
      "https://vikop-ai.onrender.com"
    ).replace(/\/+$/, "");

    return res.status(200).type("html").send(
      "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;text-align:center;padding:40px'>" +
      "<h2>Email verified successfully ✅</h2>" +
      "<p>Your VikoP AI account is now active.</p>" +
      "<p><a href='" +
      escapeHtml(appUrl) +
      "'>Go to VikoP AI Login</a></p>" +
      "</body></html>"
    );
  } catch (error) {
    console.error("Email verification error:", error);

    return res.status(500).type("html").send(
      "<h2>Verification failed</h2><p>Please try again later.</p>"
    );
  }
}

export async function register(req, res) {
  try {
    const { name, email, password, businessName, industry } = req.body;

    if (!name || !email || !password || !businessName) {
      return res.status(400).json({
        error: "Name, email, password and business name are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    const businessId = createId();
    const userId = createId();
    const passwordHash = await bcrypt.hash(password, 12);

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = hashVerificationToken(
      verificationToken
    );

    const verificationExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    await pool.query("BEGIN");

    try {
      await pool.query(
        `INSERT INTO businesses (id, name, industry)
         VALUES ($1, $2, $3)`,
        [
          businessId,
          businessName.trim(),
          industry?.trim() || null
        ]
      );

      await pool.query(
        `INSERT INTO users
         (
           id,
           business_id,
           name,
           email,
           password_hash,
           email_verified,
           verification_token_hash,
           verification_expires_at
         )
         VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)`,
        [
          userId,
          businessId,
          name.trim(),
          normalizedEmail,
          passwordHash,
          verificationTokenHash,
          verificationExpiresAt
        ]
      );

      const trialStartedAt = new Date();
      const trialEndsAt = new Date(
        trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000
      );

      await pool.query(
        `INSERT INTO subscriptions
         (
           id,
           user_id,
           plan,
           status,
           trial_started_at,
           trial_ends_at
         )
         VALUES ($1, $2, 'pro', 'trialing', $3, $4)`,
        [
          createId(),
          userId,
          trialStartedAt,
          trialEndsAt
        ]
      );

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        name: name.trim(),
        token: verificationToken
      });
    } catch (emailError) {
      console.error(
        "Verification email send error:",
        emailError
      );

      try {
        await cleanupPendingAccount(
          userId,
          businessId
        );
      } catch (cleanupError) {
        console.error(
          "Pending account cleanup error:",
          cleanupError
        );
      }

      return res.status(503).json({
        error:
          "Account could not be created because the verification email could not be sent."
      });
    }

    return res.status(201).json({
      message:
        "Account created. Please check your email and verify your account before signing in.",
      verificationRequired: true,
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        businessId,
        businessName: businessName.trim(),
        industry: industry?.trim() || null
      }
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      error: "Registration failed. Please try again."
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.password_hash,
        u.business_id,
        u.email_verified,
        b.name AS business_name,
        b.industry
       FROM users u
       JOIN businesses b ON b.id = u.business_id
       WHERE u.email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error:
          "Please verify your email before signing in."
      });
    }

    const token = createToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.business_id,
        businessName: user.business_name,
        industry: user.industry
      }
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "Login failed. Please try again."
    });
  }
}

export function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required."
      });
    }

    const token = header.slice(7);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired authentication token."
    });
  }
}
