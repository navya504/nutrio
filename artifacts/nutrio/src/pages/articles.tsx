import { Link, useParams } from 'wouter';
import { ArrowLeft, ArrowRight, Clock3, Leaf } from 'lucide-react';
import { useGetArticle, useGetArticles } from '@workspace/api-client-react';
import type { Article } from '@workspace/api-client-react';
import { useSeo } from '@/lib/seo';
import { NewsletterSignup } from '@/components/newsletter-signup';
import { DISCLAIMER } from '@/lib/disclaimer';

export function ArticleCard({ article }: { article: Article }) {
  return <Link href={`/articles/${article.slug}`} className="block rounded-[22px] border border-[#e0e3d8] bg-[#f0f1e8] p-6 text-inherit no-underline transition-colors hover:bg-[#e9eddf]" data-testid={`card-article-${article.slug}`}>
    <div className="eyebrow">{article.category}</div>
    <h3 className="font-display mt-4 text-xl font-bold leading-snug tracking-[-.04em] text-[#243b2e]">{article.title}</h3>
    <p className="mt-3 line-clamp-3 text-[13px] leading-6 text-[#68766b]">{article.summary}</p>
    <p className="mt-5 flex items-center gap-1.5 text-[11px] font-semibold text-[#819084]"><Clock3 size={13}/>{article.readMinutes} min read</p>
  </Link>;
}

export function ArticleSkeleton() {
  return <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-48 rounded-[22px]"/>)}</div>;
}

export function ArticleError({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return <div className="rounded-[20px] border border-[#e0e4d8] bg-[#f0f1e8] px-6 py-10 text-center" role="status"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#dce7cb] text-[#315f43]"><Leaf size={19}/></div><h3 className="font-display mt-4 text-xl font-bold text-[#263e30]">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#67776a]">{message}</p>{retry && <button type="button" className="btn-secondary mt-5" onClick={retry} data-testid="button-retry">Try again</button>}</div>;
}

export function ArticlesPage() {
  useSeo('Healthy living articles', 'Short, practical reads on everyday eating, training and budget-friendly nutrition from Nutrio.');
  const q = useGetArticles();
  return <div className="page-wrap py-11 md:py-16">
    <div className="max-w-2xl"><div className="eyebrow">Healthy living</div><h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Short reads, <span className="serif font-medium italic text-[#668052]">real life.</span></h1><p className="mt-4 text-sm leading-7 text-[#68766b]">Plain-spoken pieces on eating well around busy days, workouts and tight budgets.</p></div>
    <div className="mt-10">{q.isLoading ? <ArticleSkeleton/> : q.isError ? <ArticleError title="Articles did not load" message="Please try again in a moment." retry={() => q.refetch()}/> : q.data?.length ? <div className="grid gap-4 md:grid-cols-3" data-testid="list-articles">{q.data.map((a) => <ArticleCard key={a.slug} article={a}/>)}</div> : <ArticleError title="No articles yet" message="Nothing is published right now. Check back soon."/>}</div>
    <p className="mt-8 text-[11px] leading-5 text-[#7a877c]">{DISCLAIMER}</p>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[22px] bg-[#e8eddc] p-6"><p className="font-display text-xl font-bold tracking-[-.04em] text-[#2a4433]">Want to be counted in for updates?</p><Link href="/newsletter" className="btn-secondary">Register interest <ArrowRight size={15}/></Link></div>
  </div>;
}

export function ArticlePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const q = useGetArticle(slug);
  useSeo(q.data?.title ?? 'Article', q.data?.summary ?? 'Read a short healthy living article from Nutrio.');
  const back = <Link href="/articles" className="btn-secondary mt-5"><ArrowLeft size={15}/> All articles</Link>;
  if (q.isLoading) return <div className="page-wrap max-w-3xl py-12"><div className="skeleton h-10 w-3/4 rounded"/><div className="skeleton mt-6 h-64 rounded-2xl"/></div>;
  const notFound = (q.error as { status?: number } | null)?.status === 404;
  if (q.isError && !notFound) return <div className="page-wrap py-16"><ArticleError title="This article did not load" message="Something went wrong fetching it." retry={() => q.refetch()}/>{back}</div>;
  if (!q.data) return <div className="page-wrap py-16"><ArticleError title="Article not found" message="It may have been moved or unpublished."/>{back}</div>;
  const a = q.data;
  return <article className="page-wrap max-w-3xl py-11 md:py-16">
    <Link href="/articles" className="inline-flex items-center gap-2 text-sm font-bold text-[#315f43] no-underline"><ArrowLeft size={15}/> All articles</Link>
    <div className="eyebrow mt-8">{a.category}</div>
    <h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-.06em] text-[#20352c] sm:text-5xl" data-testid="text-article-title">{a.title}</h1>
    <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#819084]"><Clock3 size={13}/>{a.readMinutes} min read</p>
    <p className="mt-6 text-lg leading-8 text-[#55655a]">{a.summary}</p>
    {a.sections.map((s) => <section key={s.heading} className="mt-10"><h2 className="font-display text-2xl font-bold tracking-[-.045em] text-[#20352c]">{s.heading}</h2>{s.paragraphs.map((p, i) => <p key={i} className="mt-4 text-[15px] leading-7 text-[#4f6054]">{p}</p>)}</section>)}
    <p className="mt-12 rounded-xl bg-[#f6e8c6] p-4 text-[12px] leading-5 text-[#7b5b17]" data-testid="text-article-disclaimer">This article is for general education only and is not medical or dietary advice. {DISCLAIMER}</p>
    {back}
  </article>;
}

export function NewsletterPage() {
  useSeo('Nutrio newsletter', 'Get a one-time welcome email with practical meal tips and Nutrio article highlights. Open to members and guests.');
  return <div className="page-wrap grid gap-10 py-11 md:grid-cols-[1fr_1fr] md:py-16">
    <div><div className="eyebrow">Eat Smart. Live Better.</div><h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-5xl">A useful start to your Nutrio journey.</h1><p className="mt-4 max-w-md text-sm leading-7 text-[#68766b]">Sign up for a real, one-time welcome newsletter with simple meal tips, breakfast ideas and highlights from our healthy-living articles. Please submit only your own email address.</p></div>
    <div className="rounded-[26px] border border-[#e0e3d8] bg-[#fbfaf6] p-6 md:p-8"><NewsletterSignup/></div>
  </div>;
}
