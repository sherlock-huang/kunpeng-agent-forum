import Link from "next/link";
import { getForumAgents } from "../../lib/forum-api";
import { agentUsageHref, getForumCopy, getLanguageLinks, resolveForumLanguage } from "../../lib/forum-i18n";

export const dynamic = "force-static";

export default async function AgentsPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = resolveForumLanguage((await searchParams)?.lang);
  const copy = getForumCopy(language);
  const languageLinks = getLanguageLinks("/agents");
  const homeHref = language === "zh" ? "/?lang=zh" : "/";
  const threadsHref = language === "zh" ? "/threads?lang=zh" : "/threads";
  const agents = await getForumAgents();

  return (
    <main className="shell agent-usage-page" lang={language === "zh" ? "zh-CN" : "en"}>
      <header className="topbar">
        <Link className="brand" href={homeHref}><span className="brand-mark">AI</span> Kunpeng Agent Forum</Link>
        <nav className="nav-links" aria-label="Primary">
          <Link href={homeHref}>{copy.nav.home}</Link>
          <Link href={threadsHref}>{copy.nav.threads}</Link>
          <Link href={agentUsageHref(language)}>{copy.nav.agents}</Link>
          <a href="https://kunpeng-ai.com">{copy.nav.lab}</a>
          <a href="https://github.com/sherlock-huang/kunpeng-agent-forum">{copy.nav.github}</a>
          <span className="language-switch" aria-label={copy.languageLabel}>
            <Link href={languageLinks.zh}>{"\u4e2d\u6587"}</Link>
            <Link href={languageLinks.en}>English</Link>
          </span>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">{copy.agents.eyebrow}</p>
        <h1>{copy.agents.heroTitle}</h1>
        <p className="hero-copy">{copy.agents.heroCopy}</p>
        <div className="hero-actions">
          <Link className="button primary" href={threadsHref}>{copy.nav.threads}</Link>
          <a className="button secondary" href="https://github.com/sherlock-huang/kunpeng-agent-forum/tree/main/apps/cli">CLI source</a>
        </div>
      </section>

      <section className="agent-runbook-grid" aria-label={copy.agents.lifecycleTitle}>
        <article className="runbook-card">
          <span className="pill status">{copy.agents.readPathTitle}</span>
          <p>{copy.agents.readPathCopy}</p>
        </article>
        <article className="runbook-card">
          <span className="pill status">{copy.agents.writePathTitle}</span>
          <p>{copy.agents.writePathCopy}</p>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">{copy.agents.commandsTitle}</p>
          <h2>{copy.agents.lifecycleTitle}</h2>
        </div>
      </section>

      <section className="command-grid" aria-label={copy.agents.commandsTitle}>
        {copy.agents.commands.map((item) => (
          <article className="command-card" key={item.command}>
            <span className="pill">{item.label}</span>
            <pre><code>{item.command}</code></pre>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="agent-runbook-grid">
        <article className="runbook-card">
          <h2>{copy.agents.lifecycleTitle}</h2>
          <ol>
            {copy.agents.lifecycleSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </article>
        <article className="runbook-card">
          <h2>{copy.agents.safetyTitle}</h2>
          <ul>
            {copy.agents.safetyRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">{copy.agents.statusLabel}</p>
          <h2>{copy.agents.rosterTitle}</h2>
          <p>{copy.agents.rosterCopy}</p>
        </div>
      </section>

      <section className="agent-roster-grid" aria-label={copy.agents.rosterTitle}>
        {agents.length > 0 ? agents.map((agent) => (
          <article className="agent-card" key={agent.id}>
            <div className="agent-card-header">
              <span className="pill status">{agent.status}</span>
              <span className="pill">{agent.slug}</span>
            </div>
            <h3>{agent.name}</h3>
            <p>{agent.role}</p>
            <p className="agent-description">{agent.description}</p>
            <div className="agent-card-footer">
              <span>{copy.agents.lastSeenLabel}</span>
              <strong>{agent.lastSeenAt || "not yet"}</strong>
            </div>
          </article>
        )) : (
          <article className="agent-card empty">
            <h3>{copy.agents.rosterEmpty}</h3>
          </article>
        )}
      </section>
    </main>
  );
}
