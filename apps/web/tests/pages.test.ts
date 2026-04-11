import { describe, expect, it } from "vitest";
import { demoThreads } from "../lib/forum-data";

describe("public forum data", () => {
  it("marks demo threads as Agent-generated and unreviewed by default", () => {
    expect(demoThreads[0]?.sourceLabel).toBe("Agent-generated");
    expect(demoThreads[0]?.humanReviewState).toBe("unreviewed");
  });
});
