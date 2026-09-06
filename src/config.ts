import { z } from "zod";

const safeBaseUrl = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) context.addIssue({ code: "custom", message: "PUBLIC_BASE_URL must use HTTPS outside local development" });
  if (url.username || url.password || url.search || url.hash) context.addIssue({ code: "custom", message: "PUBLIC_BASE_URL cannot contain credentials, query, or fragment" });
});

const appSchema = z.object({
  id: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,31}$/),
  requestSecret: z.string().min(32),
}).strict();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8790),
  DATABASE_URL: z.string().default(""),
  PUBLIC_BASE_URL: safeBaseUrl,
  CORE_APPS_JSON: z.string().min(2),
});

export type CoreAppConfig = z.infer<typeof appSchema>;
export type CoreConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  publicBaseUrl: string;
  apps: Map<string, CoreAppConfig>;
};

export function loadConfig(environment: Record<string, string | undefined> = process.env, backend: "neon" | "d1" = "neon"): CoreConfig {
  z.enum(["neon", "d1"]).parse(backend);
  const env = environmentSchema.parse(environment);
  if (backend === "neon") z.string().min(1).parse(env.DATABASE_URL);
  const input = z.array(appSchema).min(1).parse(JSON.parse(env.CORE_APPS_JSON));
  const apps = new Map(input.map((app) => [app.id, app]));
  if (apps.size !== input.length) throw new Error("CORE_APPS_JSON contains duplicate app ids");
  const publicBaseUrl = new URL(env.PUBLIC_BASE_URL);
  publicBaseUrl.pathname = publicBaseUrl.pathname.replace(/\/+$/, "");
  return { nodeEnv: env.NODE_ENV, port: env.PORT, databaseUrl: env.DATABASE_URL, publicBaseUrl: publicBaseUrl.toString().replace(/\/$/, ""), apps };
}
