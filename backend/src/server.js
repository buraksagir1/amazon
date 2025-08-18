import express from "express";
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import transcriptionRoutes from './routes/transcription.route.js'

import streamTranscriptionService from './services/streamTranscriptionService.js'


import { connectDB } from "./lib/db.js";

const app = express();
const PORT = process.env.PORT;

const __dirname = path.resolve();
dotenv.config();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true, // allow frontend to send cookies
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use('/api/transcription', transcriptionRoutes); // YENİ ROTA

app.get('/api/health', (req, res) => {
  const activeTranscriptions = streamTranscriptionService.getActiveConnections();
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeTranscriptions: Object.keys(activeTranscriptions).length
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  streamTranscriptionService.cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up...');
  streamTranscriptionService.cleanup();
  process.exit(0);
});



if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});
