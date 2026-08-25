import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { sqlite } from "./db/client.js";
import { sendDueOnlineReservationEmails } from "./mail/onlineReservationEmails.js";
import { authRouter } from "./routes/auth.js";
import { emailTemplatesRouter } from "./routes/emailTemplates.js";
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
app.use("/api/email-templates", emailTemplatesRouter);
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

// Fixed daily run time — the "Online checkin" label's tooltip promises this
// exact time to families, so keep it in sync with
// apps/web/src/pages/AvailabilityPage.tsx's ONLINE_CHECKIN_CHECK_HOUR/MINUTE.
const ONLINE_RESERVATION_CHECK_HOUR = 9;
const ONLINE_RESERVATION_CHECK_MINUTE = 0;

function msUntilNextOnlineReservationCheck(): number {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    ONLINE_RESERVATION_CHECK_HOUR,
    ONLINE_RESERVATION_CHECK_MINUTE,
    0,
    0
  );
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// Errors are already handled inside the function per-reservation — this
// wrapper is just a last-resort guard so a truly unexpected throw can never
// take down the interval.
function runOnlineReservationCheck(): void {
  sendDueOnlineReservationEmails().catch((err) => {
    console.error("[online-reservation-emails] check failed:", err);
  });
}

// Catches up any due notice immediately (e.g. after downtime or a restart),
// then aligns to the fixed daily time above for every run after that.
runOnlineReservationCheck();
setTimeout(() => {
  runOnlineReservationCheck();
  setInterval(runOnlineReservationCheck, 24 * 60 * 60 * 1000);
}, msUntilNextOnlineReservationCheck());
