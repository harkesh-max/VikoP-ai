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

    await pool.query("BEGIN");

    try {
      await pool.query(
        `INSERT INTO businesses (id, name, industry)
         VALUES ($1, $2, $3)`,
        [businessId, businessName.trim(), industry?.trim() || null]
      );

      await pool.query(
        `INSERT INTO users
         (id, business_id, name, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          businessId,
          name.trim(),
          normalizedEmail,
          passwordHash
        ]
      );

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    const token = createToken({
      id: userId,
      business_id: businessId
    });

    res.status(201).json({
      token,
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

    res.status(500).json({
      error: "Registration failed."
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

    const token = createToken(user);

    res.json({
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

    res.status(500).json({
      error: "Login failed."
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
