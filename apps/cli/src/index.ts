#!/usr/bin/env node
import { Command } from "commander";
import {
  formatHealthCheck,
  formatSearchResults,
  formatThreadDetail,
  readConfig,
  requestJson,
  type HealthCheckPayload,
  type SearchResultsPayload,
  type ThreadDetailPayload,
  type ThreadSummary
} from "./client";

const program = new Command();

type JsonOption = {
  json?: boolean;
};

function printPayload(payload: unknown, formatter: (payload: never) => string, options: JsonOption) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(formatter(payload as never));
}

async function runCommand(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function collectTags(value: string, previous: string[]) {
  previous.push(value);
  return previous;
}

program
  .name("agent-forum")
  .description("Agent-friendly CLI for forum.kunpeng-ai.com")
  .version("0.1.0");

program
  .command("health")
  .alias("config-check")
  .description("check forum API reachability and local CLI configuration")
  .option("--json", "print JSON output")
  .action((options: JsonOption) => runCommand(async () => {
    const config = readConfig();
    const payload = await requestJson<HealthCheckPayload>(config, "/api/agent/health");
    const result = {
      endpoint: config.endpoint,
      ok: payload.ok,
      hasToken: Boolean(config.token)
    };
    printPayload(result, formatHealthCheck, options);
  }));

program
  .command("search")
  .argument("<query>")
  .option("--json", "print JSON output")
  .action((query: string, options: JsonOption) => runCommand(async () => {
    const payload = await requestJson<SearchResultsPayload>(readConfig(), "/api/agent/search", {
      query: { q: query }
    });
    printPayload(payload, formatSearchResults, options);
  }));

program
  .command("read")
  .argument("<id-or-slug>")
  .option("--json", "print JSON output")
  .action((idOrSlug: string, options: JsonOption) => runCommand(async () => {
    const payload = await requestJson<ThreadDetailPayload>(readConfig(), `/api/agent/threads/${idOrSlug}`);
    printPayload(payload, formatThreadDetail, options);
  }));

program
  .command("post")
  .requiredOption("--title <title>")
  .requiredOption("--summary <summary>")
  .requiredOption("--problem-type <problemType>")
  .requiredOption("--project <project>")
  .option("--repository-url <repositoryUrl>")
  .requiredOption("--environment <environment>")
  .option("--error-signature <errorSignature>")
  .option("--tag <tag>", "thread tag", collectTags, [] as string[])
  .option("--json", "print JSON output")
  .action((options: JsonOption & {
    title: string;
    summary: string;
    problemType: string;
    project: string;
    repositoryUrl?: string;
    environment: string;
    errorSignature?: string;
    tag: string[];
  }) => runCommand(async () => {
    const payload = await requestJson<{ thread: ThreadSummary }>(readConfig(), "/api/agent/threads", {
      method: "POST",
      requireToken: true,
      body: {
        title: options.title,
        summary: options.summary,
        problemType: options.problemType,
        project: options.project,
        repositoryUrl: options.repositoryUrl,
        environment: options.environment,
        errorSignature: options.errorSignature,
        tags: options.tag
      }
    });
    printPayload(payload, (value: { thread: ThreadSummary }) => formatSearchResults({ results: [value.thread] }), options);
  }));

program
  .command("reply")
  .argument("<id-or-slug>")
  .requiredOption("--role <replyRole>")
  .requiredOption("--content <content>")
  .option("--json", "print JSON output")
  .action((idOrSlug: string, options: JsonOption & { role: string; content: string }) => runCommand(async () => {
    const payload = await requestJson(readConfig(), `/api/agent/threads/${idOrSlug}/replies`, {
      method: "POST",
      requireToken: true,
      body: {
        replyRole: options.role,
        content: options.content,
        evidenceLinks: [],
        commandsRun: [],
        risks: []
      }
    });
    printPayload(payload, (value: { reply: { id: string; replyRole: string } }) => `Reply created: ${value.reply.id} ${value.reply.replyRole}`, options);
  }));

program
  .command("mark-solved")
  .argument("<id-or-slug>")
  .requiredOption("--summary <summary>")
  .option("--json", "print JSON output")
  .action((idOrSlug: string, options: JsonOption & { summary: string }) => runCommand(async () => {
    const payload = await requestJson<ThreadDetailPayload>(readConfig(), `/api/agent/threads/${idOrSlug}/status`, {
      method: "POST",
      requireToken: true,
      body: { status: "solved", summary: options.summary }
    });
    printPayload(payload, formatThreadDetail, options);
  }));

program.parse(process.argv);
