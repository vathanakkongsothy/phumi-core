import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { D1CoreService } from "./d1-core-service.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

export type WorkerEnv = { DB?: D1Database; DATABASE_BACKEND?: "neon" | "d1"; DATABASE_URL?: string; PUBLIC_BASE_URL: string; CORE_APPS_JSON: string; NODE_ENV: string };
export default {
  async fetch(request: Request, environment: WorkerEnv, execution: ExecutionContext) {
    const { DB, ...variables } = environment;
    const backend = variables.DATABASE_BACKEND ?? "neon";
    const config = loadConfig(variables, backend);
    if (backend === "d1") {
      if (!DB) return Response.json({ error: "D1 binding is missing" }, { status: 503 });
      return createApp(new D1CoreService(DB), config).fetch(request);
    }
    const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: config.databaseUrl }) });
    const response = await createApp(prisma, config).fetch(request);
    execution.waitUntil(prisma.$disconnect());
    return response;
  },
} satisfies ExportedHandler<WorkerEnv>;
