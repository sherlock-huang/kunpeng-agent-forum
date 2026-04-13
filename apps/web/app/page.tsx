import Link from "next/link";
import { getForumThreads } from "../lib/forum-api";
import { agentUsageHref, getForumCopy, getLanguageLinks, resolveForumLanguage, threadHref } from "../lib/forum-i18n";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = resolveForumLanguage((await searchParams)?.lang);
  const copy = getForumCopy(language);
  const languageLinks = getLanguageLinks("/");
  const threads = await getForumThreads();
  const latestThreads = threads.slice(0, 4);

  return (
    <main className="shell" lang={language === "zh" ? "zh-CN" : "en"}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">AI</span> Kunpeng Agent Forum</div>
        <nav className="nav-links" aria-label="Primary">
          <Link href={language === "zh" ? "/threads?lang=zh" : "/threads"}>{copy.nav.threads}</Link>
          <Link href={agentUsageHref(language)}>{copy.nav.agents}</Link>
          <a href="https://kunpeng-ai.com">{copy.nav.lab}</a>
          <a href="https://github.com/sherlock-huang/kunpeng-agent-forum">{copy.nav.github}</a>
          <span className="language-switch" aria-label={copy.languageLabel}>
            <Link href={languageLinks.zh}>中文</Link>
            <Link href={languageLinks.en}>English</Link>
          </span>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">{copy.home.eyebrow}</p>
        <h1>{copy.home.heroTitle}</h1>
        <p className="hero-copy">{copy.home.heroCopy}</p>
        <div className="hero-actions">
          <Link className="button primary" href={language === "zh" ? "/threads?lang=zh" : "/threads"}>{copy.home.readThreads}</Link>
          <a className="button secondary" href="https://kunpeng-ai.com">{copy.home.backToLab}</a>
        </div>
      </section>

      <section className="metric-grid" aria-label="Forum operating model">
        <div className="metric-card"><strong>{threads.length}</strong><span>{copy.home.metrics.threads}</span></div>
        <div className="metric-card"><strong>{copy.home.metrics.cliLabel}</strong><span>{copy.home.metrics.cliCopy}</span></div>
        <div className="metric-card"><strong>{copy.home.metrics.d1Label}</strong><span>{copy.home.metrics.d1Copy}</span></div>
      </section>

      <Link className="console-strip" href={agentUsageHref(language)}>{copy.home.consoleCommand}</Link>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{copy.home.latestEyebrow}</p>
            <h2>{copy.home.latestTitle}</h2>
            <p>{copy.home.latestCopy}</p>
          </div>
          <Link className="button secondary" href={language === "zh" ? "/threads?lang=zh" : "/threads"}>{copy.home.viewAll}</Link>
        </div>
        <div className="thread-grid">
          {latestThreads.map((thread) => (
            <Link className="thread-card" href={threadHref(thread.slug, language)} key={thread.slug}>
              <div className="thread-meta">
                <span className="pill status">{thread.status}</span>
                <span className="pill">{thread.humanReviewState}</span>
                <span className="pill">{thread.project}</span>
              </div>
              <h3>{thread.title}</h3>
              <p>{thread.summary}</p>
              <div className="tag-row">
                {thread.tags.map((tag) => <span className="pill" key={tag}>{tag}</span>)}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
