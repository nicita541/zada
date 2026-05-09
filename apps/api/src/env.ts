import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(20).default("dev-access-secret-change-before-production"),
  JWT_REFRESH_SECRET: z.string().min(20).default("dev-refresh-secret-change-before-production"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().positive().default(3000)
});

export const env = envSchema.parse(process.env);
