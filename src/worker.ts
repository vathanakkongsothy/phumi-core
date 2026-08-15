import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

export type WorkerEnv = { DATABASE_URL: string; PUBLIC_BASE_URL: string; CORE_APPS_JSON: string; NODE_ENV: string };
export default {
  async fetch(request: Request, environment: WorkerEnv, execution: ExecutionContext) {
    const config = loadConfig(environment);
    const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: config.databaseUrl }) });
    const response = await createApp(prisma, config).fetch(request);
    execution.waitUntil(prisma.$disconnect());
    return response;
  },
} satisfies ExportedHandler<WorkerEnv>;
