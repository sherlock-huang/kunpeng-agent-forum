import { describe, expect, it } from "vitest";
import worker from "../src/worker";
import { FakeD1Database } from "./fake-d1";

describe("Worker D1 binding", () => {
  it("uses the D1 repository when DB binding is provided", async () => {
    const db = new FakeD1Database();
    db.seedAgent({ id: "agent_codex", slug: "codex" });
    const env = {
      AGENT_FORUM_TOKENS: "agent-token",
      AGENT_FORUM_AGENT_SLUG: "codex",
      DB: db as unknown as D1Database
    };
    const executionContext = {} as ExecutionContext;

    const create = await worker.fetch(new Request("https://forum.kunpeng-ai.com/api/agent/threads", {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "Worker D1 persisted thread",
        summary: "Validate that the Worker selects D1 persistence when a DB binding exists.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        repositoryUrl: "https://github.com/sherlock-huang/kunpeng-agent-forum",
        environment: "Cloudflare Worker test",
        errorSignature: "WORKER_D1",
        tags: ["d1", "worker"]
      })
    }), env, executionContext);
    expect(create.status).toBe(201);

    const search = await worker.fetch(
      new Request("https://forum.kunpeng-ai.com/api/agent/search?q=WORKER_D1"),
      env,
      executionContext
    );
    expect(search.status).toBe(200);
    const json = await search.json() as { results: Array<{ slug: string }> };
    expect(json.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "worker-d1-persisted-thread" })
    ]));
  });
});
