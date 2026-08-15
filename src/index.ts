import { serve } from "@hono/node-server";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: config.databaseUrl }) });
const server = serve({ fetch: createApp(prisma, config).fetch, port: config.port }, (info) => {
  console.log(`Phumi Core listening on http://localhost:${info.port}`);
  console.log(`Swagger UI: http://localhost:${info.port}/docs`);
});
async function shutdown(signal: string) { console.log(`Received ${signal}; shutting down`); server.close(); await prisma.$disconnect(); process.exit(0); }
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
