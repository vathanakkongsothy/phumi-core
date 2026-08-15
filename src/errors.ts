import { Prisma } from "@prisma/client";
import type { Context } from "hono";
import { z } from "zod";

export class CoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 503 = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export function errorResponse(context: Context, error: unknown) {
  if (error instanceof CoreError) return context.json({ error: { code: error.code, message: error.message, details: error.details ?? null } }, error.status);
  if (error instanceof z.ZodError) return context.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() } }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return context.json({ error: { code: "RESOURCE_CONFLICT", message: "A resource with this identifier already exists", details: null } }, 409);
  return context.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", details: null } }, 500);
}
