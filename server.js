import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { register, login, authenticate } from "./auth.js";
import { registerBusinessAIRoutes } from "./business-ai.js";
import pool from "./db.js";
import multer from "multer";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.static("dist"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "dist" });
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const pdfUpload = multer({
  dest: ".tmp/pdf-incoming",
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

app.post("/api/auth/register", register);
app.post("/api/auth/login", login);

const { execFile } = await import("child_process");
const { promisify } = await import("util");
const fs = await import("fs/promises");
const path = await import("path");

const execFileAsync = promisify(execFile);

async function runCurl(args, options = {}) {
  return await execFileAsync("curl", args, {
    maxBuffer: 100 * 1024 * 1024,
    ...options
  });
}

// ⚡ FAST single-request upload (multipart) — session-start round trip hata diya
app.post(
  "/api/upload-pdf-stream",
  express.raw({ type: "application/pdf", limit: "50mb" }),
  async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is missing." });
      }

      const pdfBuffer = req.body;

      if (!pdfBuffer || !pdfBuffer.length) {
        return res.status(400).json({ error: "PDF content missing hai." });
      }

      if (pdfBuffer.length > 50 * 1024 * 1024) {
        return res.status(400).json({ error: "PDF 50 MB se badi hai." });
      }

      const originalName = String(req.query?.name || "document.pdf");
      const safeName =
        originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document.pdf";

      const startedAt = Date.now();

      console.log(
        "PDF streaming upload start: " + safeName + " (" + pdfBuffer.length + " bytes)"
      );

      const boundary = "vikoai-" + Date.now();
      const metadata = JSON.stringify({ file: { display_name: safeName } });

      const multipartBody = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
        ),
        pdfBuffer,
        Buffer.from(`\r\n--${boundary}--`)
      ]);

      const uploadResponse = await fetch(
        "https://generativelanguage.googleapis.com/upload/v1beta/files",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": process.env.GEMINI_API_KEY,
            "X-Goog-Upload-Protocol": "multipart",
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(multipartBody.length)
          },
          body: multipartBody
        }
      );

      const responseText = await uploadResponse.text();

      if (!uploadResponse.ok) {
        throw new Error(
          "Gemini upload failed (" + uploadResponse.status + "): " + responseText
        );
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error("Gemini upload ne invalid JSON diya.");
      }

      if (!result?.file?.uri) {
        throw new Error("Gemini upload ne file URI return nahi kiya.");
      }

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      console.log(
        "PDF streaming upload complete: " + safeName + " (" + seconds + " seconds)"
      );

      return res.json({
        name: originalName,
        mimeType: result.file.mimeType || "application/pdf",
        fileUri: result.file.uri,
        fileName: result.file.name || null
      });
    } catch (error) {
      console.error("PDF streaming upload error:", error?.message || error);

      if (!res.headersSent) {
        return res.status(500).json({
          error: error?.message || "PDF streaming upload failed."
        });
      }
    }
  }
);

app.post(
  "/api/upload-pdf",
  pdfUpload.single("file"),
  async (req, res) => {
    let tempPath = null;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "PDF file is required." });
      }

      const originalName = req.file.originalname || "document.pdf";

      const isPDF =
        req.file.mimetype === "application/pdf" || /\.pdf$/i.test(originalName);

      if (!isPDF) {
        return res.status(400).json({ error: "Only PDF files are supported." });
      }

      if (req.file.size > 50 * 1024 * 1024) {
        return res.status(400).json({ error: "PDF 50 MB se badi hai." });
      }

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing.");
      }

    const tempDir = path.join(process.cwd(), ".tmp");
      await fs.mkdir(tempDir, { recursive: true });

      const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");

      tempPath = path.join(tempDir, Date.now() + "-" + safeName);

      await fs.copyFile(req.file.path, tempPath);

      await fs.rm(req.file.path, { force: true }).catch(() => {});

      console.log("PDF upload start: " + safeName + " (" + req.file.size + " bytes)");

      const pdfUploadStartedAt = Date.now();

      console.log("PDF -> Gemini upload START: " + safeName);

      const uploadedFile = await ai.files.upload({
        file: tempPath,
        config: {
          mimeType: "application/pdf",
          displayName: safeName
        }
      });

      if (!uploadedFile || !uploadedFile.uri) {
        throw new Error("Gemini Files API ne uploaded PDF URI return nahi kiya.");
      }

      const pdfUploadSeconds = ((Date.now() - pdfUploadStartedAt) / 1000).toFixed(1);

      console.log("PDF upload complete: " + safeName + " (" + pdfUploadSeconds + " seconds)");

      return res.json({
        name: originalName,
        mimeType: uploadedFile.mimeType || "application/pdf",
        fileUri: uploadedFile.uri,
        fileName: uploadedFile.name || null
      });
    } catch (error) {
      console.error(
        "PDF upload error:",
        error && (error.message || error.toString() || error)
      );

      return res.status(500).json({
        error: (error && error.message) || "PDF upload failed."
      });
    } finally {
      if (tempPath) {
        await fs.rm(tempPath, { force: true }).catch(() => {});
      }

      if (req.file && req.file.path) {
        await fs.rm(req.file.path, { force: true }).catch(() => {});
      }
    }
  }
);

// Permanent VikoP Business AI routes
registerBusinessAIRoutes(app);


const PLAN_LIMITS = Object.freeze({
  free: 15,
  pro: 500,
  business: 2000
});

async function reserveAIRequest(userId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let subscriptionResult = await client.query(
      `
      SELECT
        plan,
        status,
        trial_ends_at,
        current_period_end
      FROM subscriptions
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    if (subscriptionResult.rows.length === 0) {
      await client.query(
        `
        INSERT INTO subscriptions (
          id,
          user_id,
          plan,
          status
        )
        VALUES (gen_random_uuid(), $1, 'free', 'active')
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId]
      );

      subscriptionResult = await client.query(
        `
        SELECT
          plan,
          status,
          trial_ends_at,
          current_period_end
        FROM subscriptions
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );
    }

    const subscription = subscriptionResult.rows[0];

    let plan = subscription?.plan || "free";
    let status = subscription?.status || "active";

    if (
      status === "trialing" &&
      subscription?.trial_ends_at &&
      new Date(subscription.trial_ends_at).getTime() <= Date.now()
    ) {
      plan = "free";
      status = "expired";

      await client.query(
        `
        UPDATE subscriptions
        SET
          plan = 'free',
          status = 'expired',
          updated_at = NOW()
        WHERE user_id = $1
        `,
        [userId]
      );
    }

    if (!PLAN_LIMITS[plan]) {
      plan = "free";
    }

    const limit = PLAN_LIMITS[plan];

    await client.query(
      `
      INSERT INTO usage_daily (
        id,
        user_id,
        usage_date,
        ai_requests
      )
      VALUES (
        gen_random_uuid(),
        $1,
        CURRENT_DATE,
        0
      )
      ON CONFLICT (user_id, usage_date) DO NOTHING
      `,
      [userId]
    );

    const usageResult = await client.query(
      `
      SELECT ai_requests
      FROM usage_daily
      WHERE user_id = $1
        AND usage_date = CURRENT_DATE
      FOR UPDATE
      `,
      [userId]
    );

    const used = Number(usageResult.rows[0]?.ai_requests || 0);

    if (used >= limit) {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        plan,
        used,
        limit
      };
    }

    await client.query(
      `
      UPDATE usage_daily
      SET
        ai_requests = ai_requests + 1,
        updated_at = NOW()
      WHERE user_id = $1
        AND usage_date = CURRENT_DATE
      `,
      [userId]
    );

    await client.query("COMMIT");

    return {
      allowed: true,
      plan,
      used: used + 1,
      limit
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function releaseAIRequest(userId) {
  try {
    await pool.query(
      `
      UPDATE usage_daily
      SET
        ai_requests = GREATEST(ai_requests - 1, 0),
        updated_at = NOW()
      WHERE user_id = $1
        AND usage_date = CURRENT_DATE
      `,
      [userId]
    );
  } catch (error) {
    console.error("Failed to release AI usage:", error);
  }
}

app.post("/chat", authenticate, async (req, res) => {
  console.log("CHAT request received:", {
    hasMessage: !!req.body?.message,
    attachments: Array.isArray(req.body?.attachments)
      ? req.body.attachments.map((f) => ({
          name: f?.name,
          mimeType: f?.mimeType,
          hasFileUri: !!f?.fileUri
        }))
      : []
  });

  const {
    message,
    history = [],
    attachments = [],
    businessKnowledge = "",
    industryMode = "",
    businessMode = false
  } = req.body;

  let usageReserved = false;
  let payloadPath = null;

  if (!message && history.length === 0) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const usage = await reserveAIRequest(req.user.userId);

    if (!usage.allowed) {
      const upgradePlan =
        usage.plan === "free"
          ? "Pro"
          : usage.plan === "pro"
            ? "Business"
            : "higher access";

      return res.status(429).json({
        error:
          `Daily AI limit reached (${usage.limit} requests). Upgrade to ${upgradePlan} for more usage.`,
        plan: usage.plan,
        used: usage.used,
        limit: usage.limit,
        upgradeRequired: true
      });
    }

    usageReserved = true;
    let rememberedName = "";

    for (const item of Array.isArray(history) ? history : []) {
      if (item?.role !== "user" || !item?.text) continue;

      const text = String(item.text).trim();

      const match =
        text.match(/mera naam\s+(?:hai\s+)?([A-Za-z][A-Za-z0-9 _-]{0,30})/i) ||
        text.match(/my name is\s+([A-Za-z][A-Za-z0-9 _-]{0,30})/i);

      if (match) {
        rememberedName = match[1].replace(/\s+(hai|h)\s*$/i, "").trim();
      }
    }

    let systemInstruction =
      "You are VikoAI. You have access to the complete conversation history in context. " +
      "Always carefully read the previous messages before answering. " +
      "Never claim that you do not know something if it is clearly present in the history. " +
      "Remember useful information the user has explicitly told you and use it naturally. " +
      "For currency, use the currency appropriate to the user and context. " +
      "For Indian Rupees or India-related prices, always write Rs. like Rs. 500 and never use the $ symbol. " +
      "If the user explicitly asks for US Dollars or another foreign currency, use the requested currency. " +
      "Use LaTeX only for actual mathematical expressions, never for currency.";

    if (businessMode) {
      systemInstruction +=
        "\n\nBUSINESS ASSISTANT MODE\n" +
        `Industry: ${industryMode || "General Business"}\n` +
        "BUSINESS KNOWLEDGE PROVIDED BY THE USER:\n" +
        `${String(businessKnowledge || "").trim() || "No business knowledge has been provided."}\n\n` +
        "Rules:\n" +
        "- Carefully read the Business Knowledge.\n" +
        "- If a business-specific fact is present there, answer directly from it.\n" +
        "- Do not invent or contradict business prices, timings, services, policies, fees, offers, or company facts.\n" +
        "- If requested business information is missing, say it has not been provided.\n" +
        "- For simple factual questions, answer directly and concisely.";
    }

    if (rememberedName) {
      systemInstruction += ` The user's name is "${rememberedName}". Remember this and use it when appropriate.`;
    }

    const hasPdfAttachment = [
      ...(Array.isArray(attachments) ? attachments : []),
    ].some(
      (file) =>
        file?.fileUri &&
        (
          file?.mimeType === "application/pdf" ||
          /\.pdf$/i.test(String(file?.name || ""))
        )
    ) || (
      Array.isArray(history) &&
      history.some(
        (item) =>
          Array.isArray(item?.attachments) &&
          item.attachments.some(
            (file) =>
              file?.fileUri &&
              (
                file?.mimeType === "application/pdf" ||
                /\.pdf$/i.test(String(file?.name || ""))
              )
          )
      )
    );

    const currentParts = [];

    if (message && String(message).trim()) {
      currentParts.push({
        text: String(message)
      });
    }

    if (Array.isArray(attachments)) {
      for (const file of attachments) {
        if (file?.fileUri && file?.mimeType) {
          currentParts.push({
            file_data: {
              mime_type: file.mimeType,
              file_uri: file.fileUri
            }
          });
        } else if (file?.data && file?.mimeType) {
          currentParts.push({
            inline_data: {
              mime_type: file.mimeType,
              data: file.data
            }
          });
        }
      }
    }

    const contents = [];

    if (!hasPdfAttachment) {
      for (const item of Array.isArray(history) ? history : []) {
        if (!item || !item.role) continue;

        const parts = [];

        if (item.text && String(item.text).trim()) {
          parts.push({ text: String(item.text) });
        }

        if (Array.isArray(item.attachments)) {
          for (const file of item.attachments) {
            if (file?.fileUri && file?.mimeType) {
              parts.push({
                file_data: {
                  mime_type: file.mimeType,
                  file_uri: file.fileUri
                }
              });
            } else if (file?.data && file?.mimeType) {
              parts.push({
                inline_data: {
                  mime_type: file.mimeType,
                  data: file.data
                }
              });
            }
          }
        }

        if (parts.length > 0) {
          contents.push({
            role: item.role === "assistant" ? "model" : "user",
            parts
          });
        }
      }

      if (currentParts.length > 0) {
        contents.push({
          role: "user",
          parts: currentParts
        });
      }
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const payload = hasPdfAttachment
      ? null
      : JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { temperature: 0.7 }
        });

    let pdfPayload = null;

    if (hasPdfAttachment) {
      // PDF-only speed optimization.
      // Non-PDF requests remain unchanged.
      const recentHistory = Array.isArray(history)
        ? history.slice(-6)
        : [];

      const pdfContents = [];

      for (const item of recentHistory) {
        if (!item || !item.role) continue;

        const parts = [];

        if (item.text && String(item.text).trim()) {
          const text = String(item.text);
          parts.push({
            text: text.length > 6000 ? text.slice(-6000) : text
          });
        }

        if (Array.isArray(item.attachments)) {
          for (const file of item.attachments) {
            if (
              file?.fileUri &&
              file?.mimeType === "application/pdf"
            ) {
              parts.push({
                file_data: {
                  mime_type: file.mimeType,
                  file_uri: file.fileUri
                }
              });
            }
          }
        }

        if (parts.length > 0) {
          pdfContents.push({
            role: item.role === "assistant" ? "model" : "user",
            parts
          });
        }
      }

      if (currentParts.length > 0) {
        pdfContents.push({
          role: "user",
          parts: currentParts
        });
      }

      pdfPayload = JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: pdfContents,
        generationConfig: { temperature: 0.7 }
      });
    }

    try {
      /*
       * PDF-ONLY SPEED PATH.
       * Non-PDF requests continue using the existing request path.
       */
      if (hasPdfAttachment) {
        console.log("PDF branch reached:", {
          hasPdfAttachment,
          pdfPayloadBytes: Buffer.byteLength(pdfPayload || "")
        });

        let geminiResponse = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            geminiResponse = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": process.env.GEMINI_API_KEY
                },
                body: pdfPayload
              }
            );

            if (geminiResponse.ok) {
              console.log(`PDF Gemini attempt ${attempt + 1}: OK`);
              break;
            }

            const errorText = await geminiResponse.text();

            console.log(
              `PDF Gemini attempt ${attempt + 1}: ${geminiResponse.status}`
            );

            if (geminiResponse.status !== 503 || attempt === 2) {
              throw new Error(
                `Gemini PDF stream failed (${geminiResponse.status}): ${errorText}`
              );
            }
          } catch (error) {
            if (attempt === 2) throw error;

            console.log(
              `PDF Gemini attempt ${attempt + 1}: FETCH ERROR - ${error?.message || error}`
            );
          }

          await new Promise((resolve) =>
            setTimeout(resolve, attempt === 0 ? 400 : 900)
          );
        }

        if (!geminiResponse.body) {
          throw new Error("Gemini PDF streaming response unavailable.");
        }

        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const reader = geminiResponse.body.getReader();
        const decoder = new TextDecoder();

        let streamBuffer = "";
        let sentText = false;

        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });

          const events = streamBuffer.split(/\r?\n\r?\n/);
          streamBuffer = events.pop() || "";

          for (const event of events) {
            const dataLine = event
              .split("\n")
              .find((line) => line.startsWith("data:"));

            if (!dataLine) continue;

            const jsonText = dataLine.slice(5).trim();

            if (!jsonText || jsonText === "[DONE]") continue;

            let chunk;

            try {
              chunk = JSON.parse(jsonText);
            } catch {
              continue;
            }

            if (chunk?.error) {
              throw new Error(
                chunk.error.message ||
                `Gemini API error (${chunk.error.code || 500}).`
              );
            }

            const chunkText =
              chunk?.candidates?.[0]?.content?.parts
                ?.map((part) => part?.text || "")
                .join("") || "";

            if (chunkText) {
              sentText = true;

              res.write(
                `data: ${JSON.stringify({ text: chunkText })}\n\n`
              );
            }
          }
        }

        streamBuffer += decoder.decode();

        if (streamBuffer.trim()) {
          const finalEvents = streamBuffer.split(/\r?\n\r?\n/);

          for (const event of finalEvents) {
            const dataLine = event
              .split("\n")
              .find((line) => line.startsWith("data:"));

            if (!dataLine) continue;

            const jsonText = dataLine.slice(5).trim();

            if (!jsonText || jsonText === "[DONE]") continue;

            try {
              const chunk = JSON.parse(jsonText);

              if (chunk?.error) {
                throw new Error(
                  chunk.error.message ||
                  `Gemini API error (${chunk.error.code || 500}).`
                );
              }

              const chunkText =
                chunk?.candidates?.[0]?.content?.parts
                  ?.map((part) => part?.text || "")
                  .join("") || "";

              if (chunkText) {
                sentText = true;

                res.write(
                  `data: ${JSON.stringify({ text: chunkText })}\n\n`
                );
              }
            } catch (error) {
              if (error?.message?.startsWith("Gemini")) {
                throw error;
              }
            }
          }
        }

        if (!sentText) {
          throw new Error("Gemini returned an empty PDF response.");
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        return res.end();
      }

      /*
       * EXISTING NON-PDF PATH — unchanged.
       */
      const tempDir = path.join(process.cwd(), ".tmp");
      await fs.mkdir(tempDir, { recursive: true });
      const payloadPath = path.join(tempDir, `${Date.now()}-chat.json`);
      await fs.writeFile(payloadPath, payload, "utf8");

      const { stdout } = await runCurl([
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        "--http1.1",
        "--max-time",
        "180",
        "--connect-timeout",
        "30",
        "--retry",
        "3",
        "--retry-delay",
        "3",
        "--retry-all-errors",
        "-sS",
        "-H",
        "Expect:",
        "-H",
        "Content-Type: application/json",
        "-H",
        `x-goog-api-key: ${process.env.GEMINI_API_KEY}`,
        "-X",
        "POST",
        "--data-binary",
        `@${payloadPath}`
      ]);

      let data;

      try {
        data = JSON.parse(stdout);
      } catch {
        throw new Error("Gemini returned invalid JSON.");
      }

      if (data?.error) {
        throw new Error(
          data.error.message ||
          `Gemini API error (${data.error.code || 500}).`
        );
      }

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || "")
          .join("") || "";

      if (!text) {
        throw new Error("Gemini returned an empty response.");
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.flushHeaders();

      res.write(`data: ${JSON.stringify({ text })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

      res.end();
    } finally {
      await fs.rm(payloadPath, { force: true }).catch(() => {});
    }
  } catch (error) {
    if (usageReserved && req.user?.userId) {
      await releaseAIRequest(req.user.userId);
    }

    console.error("Gemini REST error:", error);

    if (error?.name === "AbortError") {
      if (!res.headersSent) {
        return res.status(504).json({ error: "Gemini request timed out after 30 seconds." });
      }

      res.write(
        `data: ${JSON.stringify({ error: "Gemini request timed out after 30 seconds." })}\n\n`
      );
      return res.end();
    }

    if (!res.headersSent) {
      return res.status(500).json({ error: error?.message || "Gemini request failed." });
    }

    res.write(`data: ${JSON.stringify({ error: error?.message || "Gemini request failed." })}\n\n`);
    res.end();
  }
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'pro', 'business')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
      trial_started_at TIMESTAMPTZ,
      trial_ends_at TIMESTAMPTZ,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      provider TEXT,
      provider_customer_id TEXT,
      provider_subscription_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user
      ON subscriptions(user_id);

    CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
      ON subscriptions(plan);

    CREATE TABLE IF NOT EXISTS usage_daily (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
      ai_requests INTEGER NOT NULL DEFAULT 0,
      pdf_requests INTEGER NOT NULL DEFAULT 0,
      business_requests INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, usage_date)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date
      ON usage_daily(user_id, usage_date);
  `);

  console.log("Database tables ready.");
}

const PORT = process.env.PORT || 3001;

initializeDatabase()
  .then(() => {
    console.log("Database initialization completed.");
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    console.warn("Starting AI server without database initialization.");
  })
  .finally(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`AI server running on port ${PORT}`);
    });
  });
