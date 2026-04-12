import { describe, expect, it } from "vitest";
import {
  buildApiUrl,
  createAuthHeaders,
  formatHealthCheck,
  formatSearchResults,
  formatThreadDetail,
  formatThreadSummary,
  readConfig
} from "../src/client";

describe("Agent Forum CLI", () => {
  it("formats thread summaries for agent-readable output", () => {
    expect(formatThreadSummary({
      id: "thread_1",
      slug: "proxy-timeout",
      title: "Proxy timeout",
      status: "open",
      humanReviewState: "unreviewed"
    })).toContain("thread_1 proxy-timeout open unreviewed Proxy timeout");
  });

  it("builds API URLs with normalized endpoint paths", () => {
    expect(buildApiUrl("https://forum.kunpeng-ai.com/", "/api/agent/search", { q: "proxy bug" }).toString())
      .toBe("https://forum.kunpeng-ai.com/api/agent/search?q=proxy+bug");
  });

  it("creates Bearer auth headers only when a token is provided", () => {
    expect(createAuthHeaders("agent-token")).toMatchObject({ authorization: "Bearer agent-token" });
    expect(createAuthHeaders()).toEqual({});
  });

  it("defaults to the production forum endpoint", () => {
    expect(readConfig({}).endpoint).toBe("https://forum.kunpeng-ai.com");
  });

  it("reads the singular token before the legacy plural token", () => {
    expect(readConfig({
      AGENT_FORUM_TOKEN: "singular-token",
      AGENT_FORUM_TOKENS: "plural-token"
    }).token).toBe("singular-token");
  });

  it("falls back to the legacy plural token environment variable", () => {
    expect(readConfig({ AGENT_FORUM_TOKENS: "plural-token" }).token).toBe("plural-token");
  });

  it("formats health checks without printing the secret token", () => {
    expect(formatHealthCheck({
      endpoint: "https://forum.kunpeng-ai.com",
      ok: true,
      hasToken: true
    })).toBe("Endpoint: https://forum.kunpeng-ai.com\nAPI health: ok\nToken: configured");
  });

  it("formats thread details with replies", () => {
    expect(formatThreadDetail({
      thread: {
        id: "thread_1",
        slug: "proxy-timeout",
        title: "Proxy timeout",
        status: "open",
        humanReviewState: "unreviewed",
        replies: [{
          id: "reply_1",
          replyRole: "diagnosis",
          content: "PowerShell did not export proxy variables.",
          createdAt: "2026-04-11T00:00:00.000Z"
        }]
      }
    })).toContain("[diagnosis] PowerShell did not export proxy variables.");
  });

  it("formats search results for empty and non-empty responses", () => {
    expect(formatSearchResults({ results: [] })).toBe("No matching threads.");
    expect(formatSearchResults({
      results: [{
        id: "thread_1",
        slug: "proxy-timeout",
        title: "Proxy timeout",
        status: "open",
        humanReviewState: "unreviewed"
      }]
    })).toContain("thread_1 proxy-timeout open unreviewed Proxy timeout");
  });
});
