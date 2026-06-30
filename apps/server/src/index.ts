import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { sqlite } from "./db/client.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { reservationsRouter } from "./routes/reservations.js";
import { familiesRouter } from "./routes/families.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";

const app = express();
const port = Number(process.env.PORT ?? 3300);

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/families", familiesRouter);
app.use("/api/profile", profileRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/reservations", reservationsRouter);

app.get("/api/version", (_req, res) => {
  const [{ version }] = sqlite
    .prepare("SELECT sqlite_version() AS version")
    .all() as Array<{ version: string }>;
  res.json({ sqliteVersion: version });
});

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const webDistPath = path.resolve(currentDirectoryPath, "..", "..", "web", "dist");

if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
} else {
  app.get("*", (_req, res) => {
    res.status(503).json({
      error: "Frontend build not found. Run npm run build -w @simuni/web."
    });
  });
}

app.listen(port, () => {
  console.log(`Simuni app listening on port ${port}`);
});
