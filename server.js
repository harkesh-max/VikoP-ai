import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static("dist"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "dist" });
});

const ai = new GoogleGenAI({});

app.post("/chat", async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message && history.length === 0) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const contents = history
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
      });

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
  "For currency, always write Rs. instead of $. Never use $ for currency amounts. " +
"Use LaTeX only for actual mathematical expressions, never for currency.";
    if (rememberedName) {
      memoryInstruction +=
        ` The user's name is "${rememberedName}". Remember this and use it when appropriate.`;
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

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI server running on port ${PORT}`);
});
