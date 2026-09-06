import contract from "./contract.json";

interface D1Binding {
  prepare(sql: string): {
    all<T>(): Promise<{ results: T[]; success: boolean }>;
  };
}

// This isolated Worker verifies the candidate D1 schema. It is not the product
// Worker and deliberately has no write routes or production domain routes.
const worker = {
  async fetch(request: Request, env: { DB: D1Binding }): Promise<Response> {
    if (
      request.method !== "GET" ||
      new URL(request.url).pathname !== "/health"
    ) {
      return new Response("Not found", { status: 404 });
    }
    try {
      if (!env.DB) throw new Error("D1 binding missing");
      for (const table of contract.tables) {
        const quoted = '"' + table.name.replaceAll('"', '""') + '"';
        const result = await env.DB.prepare(
          `PRAGMA table_info(${quoted})`,
        ).all<{ name: string }>();
        if (
          !result.success ||
          table.columns.some(
            (column) => !result.results.some((row) => row.name === column.name),
          )
        )
          throw new Error("D1 schema mismatch");
      }
      return Response.json(
        { status: "ok", schema: "ok", applicationReady: false },
        { headers: { "cache-control": "no-store" } },
      );
    } catch {
      return Response.json(
        {
          status: "unavailable",
          schema: "unavailable",
          applicationReady: false,
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  },
};

export default worker;
