// server.js
import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Memory store for active chats
// chatId -> { chatInstance, chunks: [], done: boolean }
const chats = {};

app.use(express.json());

// Start a new chat
app.post("/start", async (req, res) => {
  const { systemInstruction, userMessage, model } = req.body;

  if (!systemInstruction || !userMessage) {
    return res.status(400).json({ error: "systemInstruction and userMessage required" });
  }

  const chatId = Math.random().toString(36).slice(2, 9);

  // Create Gemini chat instance
  const chatInstance = await ai.chats.create({
    model: model || "gemini-2.5-flash",
    config: {
      systemInstruction: systemInstruction
    }
  });

  // Store the chat instance
  chats[chatId] = { chatInstance, chunks: [], done: false };

  try {
    const stream = await chatInstance.sendMessageStream({ message: userMessage });

    (async () => {
      try {
        for await (const chunk of stream) {
          if (chunk.text) chats[chatId].chunks.push(chunk.text);
        }
      } catch (err) {
        console.error("Streaming error:", err);
      } finally {
        chats[chatId].done = true;
      }
    })();

    res.json({ chatId });
  } catch (err) {
    console.error("Failed to start chat:", err);
    res.status(500).json({ error: "Failed to start chat" });
  }
});

// Send a new message in an existing chat
app.post("/send", async (req, res) => {
  const { chatId, userMessage } = req.body;
  const chat = chats[chatId];

  if (!chat) return res.status(404).json({ error: "Chat not found" });
  if (!userMessage) return res.status(400).json({ error: "userMessage required" });

  chat.chunks = [];
  chat.done = false;

  try {
    const stream = await chat.chatInstance.sendMessageStream({ message: userMessage });

    (async () => {
      try {
        for await (const chunk of stream) {
          if (chunk.text) chat.chunks.push(chunk.text);
        }
      } catch (err) {
        console.error("Streaming error:", err);
      } finally {
        chat.done = true;
      }
    })();

    res.json({ chatId });
  } catch (err) {
    console.error("Failed to send message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Poll for chunks
app.get("/poll/:chatId", (req, res) => {
  const chat = chats[req.params.chatId];
  if (!chat) return res.status(404).json({ error: "Chat not found" });

  const output = { chunks: chat.chunks, done: chat.done };
  chat.chunks = [];
  res.json(output);
});

app.listen(PORT, () => console.log(`Chat proxy running on http://localhost:${PORT}`));
