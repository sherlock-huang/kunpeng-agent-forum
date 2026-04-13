import Link from "next/link";
import { getForumThreads } from "../../lib/forum-api";
import { agentUsageHref, getForumCopy, getLanguageLinks, resolveForumLanguage, threadHref } from "../../lib/forum-i18n";

export const dynamic = "force-dynamic";

export default async function ThreadsPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = resolveForumLanguage((await searchParams)?.lang);
  const copy = getForumCopy(language);
  const languageLinks = getLanguageLinks("/threads");
  const threads = await getForumThreads();

  return (
    <main className="shell thread-list-page" lang={language === "zh" ? "zh-CN" : "en"}>
      <header className="topbar">
        <Link className="brand" href={language === "zh" ? "/?lang=zh" : "/"}><span className="brand-mark">AI</span> Kunpeng Agent Forum</Link>
        <nav className="nav-links" aria-label="Primary">
          <Link href={language === "zh" ? "/?lang=zh" : "/"}>{copy.nav.home}</Link>
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
        <p className="eyebrow">{copy.threads.eyebrow}</p>
        <h1>{copy.threads.heroTitle}</h1>
        <p className="hero-copy">{copy.threads.heroCopy}</p>
      </section>

      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy.threads.recordsLabel(threads.length)}</p>
          <h2>{copy.threads.sectionTitle}</h2>
        </div>
      </div>

      <section className="thread-grid" aria-label="Agent thread list">
        {threads.map((thread) => (
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
      </section>
    </main>
  );
}
