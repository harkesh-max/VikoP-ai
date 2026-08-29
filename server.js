import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { register, login } from "./auth.js";
import { registerBusinessAIRoutes } from "./business-ai.js";
import pool from "./db.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "75mb" }));
app.use(express.static("dist"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "dist" });
});

const ai = new GoogleGenAI({});

app.post("/api/auth/register", register);
app.post("/api/auth/login", login);

// Permanent VikoP Business AI routes
registerBusinessAIRoutes(app);

app.post("/chat", async (req, res) => {
  const {
    message,
    history = [],
    attachments = [],
    businessKnowledge = "",
    industryMode = "",
    businessMode = false
  } = req.body;

  if (!message && history.length === 0) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const contents = [
      ...history
        .filter((item) => item && item.role)
        .map((item) => {
        const parts = [];

        if (item.text && item.text.trim()) {
          parts.push({ text: item.text });
        }

        if (Array.isArray(item.attachments)) {
          for (const file of item.attachments) {
            if (file?.data && file?.mimeType) {
              parts.push({
                inlineData: {
                  mimeType: file.mimeType,
                  data: file.data
                }
              });
            }
          }
        }

        return {
          role: item.role === "assistant" ? "model" : "user",
          parts
        };
        }),
      ...(message?.trim() || Array.isArray(attachments) && attachments.length > 0
        ? [{
            role: "user",
            parts: [
              ...(message?.trim()
                ? [{
                    text:
                      businessMode && String(businessKnowledge || "").trim()
                        ? (
                            "IMPORTANT BUSINESS KNOWLEDGE INSTRUCTION:\n" +
                            "Before answering the user's request, read the BUSINESS KNOWLEDGE below carefully.\n" +
                            "If the user's question asks for a business-specific fact that is present below, answer DIRECTLY using that information.\n" +
                            "Do not replace it with general knowledge. Do not invent another value.\n" +
                            "For simple factual questions, give the exact business fact first and keep the answer concise.\n\n" +
                            "===== BUSINESS KNOWLEDGE =====\n" +
                            String(businessKnowledge).trim() +
                            "\n===== END BUSINESS KNOWLEDGE =====\n\n" +
                            "USER REQUEST:\n" +
                            message.trim()
                          )
                        : message.trim()
                  }]
                : []),
              ...(
                Array.isArray(attachments)
                  ? attachments
                      .filter((file) => file?.data && file?.mimeType)
                      .map((file) => ({
                        inlineData: {
                          mimeType: file.mimeType,
                          data: file.data
                        }
                      }))
                  : []
              )
            ]
          }]
        : [])
    ];

    // User ki important personal information ko history se detect karo
    let rememberedName = "";

    for (const item of history) {
      if (item?.role !== "user" || !item?.text) continue;

      const text = item.text.trim();

      const match =
        text.match(/mera naam\s+(?:hai\s+)?([A-Za-z][A-Za-z0-9 _-]{0,30})/i) ||
        text.match(/my name is\s+([A-Za-z][A-Za-z0-9 _-]{0,30})/i);

      if (match) {
        rememberedName = match[1]
          .replace(/\s+(hai|h)\s*$/i, "")
          .trim();
      }
    }

let memoryInstruction =
  "You are VikoAI. You have access to the complete conversation history in context. " +
  "Always carefully read the previous messages before answering. " +
  "Never claim that you do not know something if it is clearly present in the history. " +
  "Remember useful information the user has explicitly told you and use it naturally. " +
  "For currency, use the currency appropriate to the user and context. For Indian Rupees or India-related prices, always write Rs. like Rs. 500 and never use the $ symbol. If the user explicitly asks for US Dollars or a foreign currency, use that requested currency symbol such as $ for USD, £ for GBP, or € for EUR. Never convert or change a currency unless the user asks for conversion. " +
  "Use LaTeX only for actual mathematical expressions, never for currency.";

    if (businessMode && String(businessKnowledge || "").trim()) {
      memoryInstruction +=
        " You are operating in BUSINESS ASSISTANT MODE. " +
        `The business industry is "${String(industryMode || "general business")}". ` +
        "The Business Knowledge Base below is the PRIMARY SOURCE OF TRUTH for this business. " +
        "When the user asks about business-specific prices, opening hours, services, policies, fees, FAQs, contact details, or other facts present in this knowledge, answer DIRECTLY from the knowledge base. " +
        "Do not invent or contradict information from the knowledge base. " +
        "Do not give a generic explanation when the requested fact is explicitly present. " +
        "Keep factual answers concise and direct. " +
        "If a requested business fact is not present, say that the information is not available in the Business Knowledge Base rather than making it up. " +
        "\n\n===== BUSINESS KNOWLEDGE BASE =====\n" +
        String(businessKnowledge).trim() +
        "\n===== END BUSINESS KNOWLEDGE BASE =====\n";
    }

    if (rememberedName) {
      memoryInstruction +=
        ` The user's name is "${rememberedName}". Remember this and use it when appropriate.`;
    }

    if (businessMode) {
      memoryInstruction += `

BUSINESS ASSISTANT MODE
The user is currently using VikoP Business mode.

Industry:
${industryMode || "General Business"}

BUSINESS KNOWLEDGE PROVIDED BY THE USER:
${businessKnowledge?.trim() || "No business knowledge has been provided."}

CRITICAL BUSINESS KNOWLEDGE RULES:
- Carefully read the BUSINESS KNOWLEDGE before answering.
- If the user's question can be answered directly from the BUSINESS KNOWLEDGE, answer using that exact information.
- Do NOT ignore, replace, or contradict the BUSINESS KNOWLEDGE.
- Do NOT invent business prices, timings, services, policies, fees, offers, or other company facts.
- If a requested fact is present in BUSINESS KNOWLEDGE, give that fact directly and clearly.
- If the information is missing, say that the business information has not been provided.
- For simple factual questions such as "What is restaurant timing?" give the direct answer first. Do not give unnecessary disclaimers or generic business advice.
`;
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      systemInstruction: memoryInstruction,
      contents
    });

    for await (const chunk of stream) {
      const text = chunk.text || "";

      if (text) {
        res.write(
          `data: ${JSON.stringify({ text })}\n\n`
        );
      }
    }

    res.write(
      `data: ${JSON.stringify({ done: true })}\n\n`
    );

    res.end();

  } catch (error) {
    console.error("Gemini error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message
      });
    } else {
      res.write(
        `data: ${JSON.stringify({
          error: error.message
        })}\n\n`
      );
      res.end();
    }
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
