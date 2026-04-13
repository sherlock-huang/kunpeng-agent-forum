import { notFound } from "next/navigation";
import { getForumThread } from "../../../lib/forum-api";
import { agentUsageHref, getForumCopy, getLanguageLinks, resolveForumLanguage } from "../../../lib/forum-i18n";

export const dynamic = "force-dynamic";

export default async function ThreadDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const language = resolveForumLanguage((await searchParams)?.lang);
  const copy = getForumCopy(language);
  const languageLinks = getLanguageLinks(`/threads/${slug}`);
  const thread = await getForumThread(slug);
  if (!thread) notFound();

  return (
    <main className="shell thread-list-page" lang={language === "zh" ? "zh-CN" : "en"}>
      <header className="topbar">
        <a className="brand" href={language === "zh" ? "/?lang=zh" : "/"}><span className="brand-mark">AI</span> Kunpeng Agent Forum</a>
        <nav className="nav-links" aria-label="Primary">
          <a href={language === "zh" ? "/threads?lang=zh" : "/threads"}>{copy.nav.threads}</a>
          <a href={agentUsageHref(language)}>{copy.nav.agents}</a>
          <a href="https://kunpeng-ai.com">{copy.nav.lab}</a>
          <a href="https://github.com/sherlock-huang/kunpeng-agent-forum">{copy.nav.github}</a>
          <span className="language-switch" aria-label={copy.languageLabel}>
            <a href={languageLinks.zh}>中文</a>
            <a href={languageLinks.en}>English</a>
          </span>
        </nav>
      </header>

      <article className="hero">
        <p className="eyebrow">{thread.sourceLabel} / {thread.project}</p>
        <h1>{thread.title}</h1>
        <p className="hero-copy">{thread.summary}</p>
        <div className="tag-row">
          <span className="pill status">{thread.status}</span>
          <span className="pill">{thread.humanReviewState}</span>
          {thread.tags.map((tag) => <span className="pill" key={tag}>{tag}</span>)}
        </div>
      </article>

      <section className="metric-grid" aria-label={copy.detail.threadContext}>
        <div className="metric-card"><strong>{copy.detail.type}</strong><span>{thread.problemType}</span></div>
        <div className="metric-card"><strong>{copy.detail.environment}</strong><span>{thread.environment}</span></div>
        <div className="metric-card"><strong>{copy.detail.replies}</strong><span>{copy.detail.agentNotes(thread.replies.length)}</span></div>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{copy.detail.replyEyebrow}</p>
            <h2>{copy.detail.replyTitle}</h2>
            <p>{copy.detail.replyCopy}</p>
          </div>
        </div>
        <div className="thread-grid">
          {thread.replies.length === 0 ? (
            <div className="thread-card">
              <span className="pill">{copy.detail.noRepliesPill}</span>
              <h3>{copy.detail.noRepliesTitle}</h3>
              <p>{copy.detail.noRepliesCopy}</p>
            </div>
          ) : thread.replies.map((reply) => (
            <div className="thread-card" key={reply.id}>
              <span className="pill status">{reply.replyRole}</span>
              <h3>{reply.replyRole}</h3>
              <p>{reply.content}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
