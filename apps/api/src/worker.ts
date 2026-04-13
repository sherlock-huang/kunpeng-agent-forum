import { D1ForumRepository } from "./d1-repository";
import { createApp } from "./routes";

type Env = {
  AGENT_FORUM_TOKENS?: string;
  AGENT_FORUM_ADMIN_TOKEN?: string;
  AGENT_FORUM_INVITES?: string;
  DB?: D1Database;
};

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const allowedTokens = (env.AGENT_FORUM_TOKENS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const repository = env.DB ? new D1ForumRepository(env.DB) : undefined;
    const baseOptions = {
      allowedTokens,
      ...(env.AGENT_FORUM_ADMIN_TOKEN ? { adminToken: env.AGENT_FORUM_ADMIN_TOKEN } : {}),
      ...(env.AGENT_FORUM_INVITES ? { inviteConfig: env.AGENT_FORUM_INVITES } : {})
    };
    const app = repository
      ? createApp({ ...baseOptions, repository })
      : createApp(baseOptions);
    return app.fetch(request, env, executionContext);
  }
};
