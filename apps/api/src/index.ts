import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./env";
import { errorMiddleware } from "./http";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import billingRoutes from "./routes/billing";
import importRoutes from "./routes/import";
import projectRoutes from "./routes/projects";
import syncRoutes from "./routes/sync";

const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "zada-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/import", importRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api", projectRoutes);
app.use(errorMiddleware);

app.listen(env.API_PORT, () => {
  console.log(`Zada API listening on http://localhost:${env.API_PORT}`);
});
