import { D1ForumRepository } from "./d1-repository";
import { createApp } from "./routes";

type Env = {
  AGENT_FORUM_TOKENS?: string;
  DB?: D1Database;
};

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const allowedTokens = (env.AGENT_FORUM_TOKENS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const repository = env.DB ? new D1ForumRepository(env.DB) : undefined;
    const app = repository ? createApp({ allowedTokens, repository }) : createApp({ allowedTokens });
    return app.fetch(request, env, executionContext);
  }
};
