import { useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Flame } from 'lucide-react';
import { getGetChallengesQueryKey, getGetMemberChallengesQueryKey, useSetChallengeCheckin, useSetChallengeMembership } from '@workspace/api-client-react';
import type { Challenge, ChallengeProgress } from '@workspace/api-client-react';
import { useMemberSession, useMyChallenges, usePublicChallenges } from '@/hooks/use-member';
import { useSeo } from '@/lib/seo';

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Card({ c, p, signedIn, memberLoading }: { c: Challenge; p?: ChallengeProgress; signedIn: boolean; memberLoading: boolean }) {
  const qc = useQueryClient();
  const join = useSetChallengeMembership();
  const check = useSetChallengeCheckin();
  const [err, setErr] = useState('');
  const busy = join.isPending || check.isPending;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: getGetMemberChallengesQueryKey() }), qc.invalidateQueries({ queryKey: getGetChallengesQueryKey() })]);
  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr((e as { status?: number })?.status === 409 ? 'This changed since you last looked (for example the day rolled over). We have refreshed it; please check and try again.' : 'That did not save. Please try again.'); }
    await refresh();
  };
  const days = Array.from({ length: c.durationDays }, (_, i) => i);
  return <article className="rounded-[26px] border border-[#e0e3d8] bg-[#fbfaf6] p-6 md:p-8" data-testid={`card-challenge-${c.slug}`}>
    <div className="eyebrow">{c.durationDays}-day challenge</div>
    <h2 className="font-display mt-2 text-3xl font-bold tracking-[-.05em] text-[#20352c]">{c.title}</h2>
    <p className="mt-2 max-w-xl text-sm leading-6 text-[#68766b]">{c.description}</p>
    <p className="mt-4 rounded-xl bg-[#e9eddf] p-3 text-sm leading-6 text-[#315f43]"><b>Daily action:</b> {c.dailyAction}</p>
    <p className="mt-2 text-xs leading-5 text-[#7a877c]">{c.safetyNote}</p>
    <p className="mt-4 text-xs font-semibold text-[#42584a]" data-testid={`text-totals-${c.slug}`}>{c.participantCount} people have joined / {c.checkinCount} check-ins recorded, community totals only.</p>
    {!signedIn ? <Link href="/sign-in" className="btn-primary mt-5" data-testid={`link-join-signin-${c.slug}`}>Sign in to join <ArrowRight size={15}/></Link> : memberLoading ? <div className="skeleton mt-5 h-24 rounded-2xl"/> : !p ? <button type="button" disabled={busy} className="btn-primary mt-5 disabled:opacity-60" onClick={() => run(() => join.mutateAsync({ slug: c.slug, data: { joined: true } }))} data-testid={`button-join-${c.slug}`}>{busy ? 'Joining...' : `Join, your ${c.durationDays} days start today`}</button> : <div className="mt-5">
      <div className="flex flex-wrap gap-5 text-sm text-[#20352c]"><span><b className="font-display text-2xl">{p.completedDays}</b> / {c.durationDays} days done</span><span className="inline-flex items-center gap-1"><Flame size={16} className="text-[#b9822c]"/><b className="font-display text-2xl">{p.streak}</b> day streak</span><span className="self-end text-xs text-[#68766b]">{p.isFinished ? 'Window finished' : `Day ${p.dayNumber} of ${c.durationDays}, ends ${fmt(p.endDate)}`}</span></div>
      <div className="mt-4 grid grid-cols-7 gap-2" role="list" aria-label="21-day calendar">{days.map((i) => { const date = addDays(p.startDate, i); const done = p.checkedDates.includes(date); const today = i + 1 === p.dayNumber && !p.isFinished; return <div role="listitem" key={date} aria-label={`Day ${i + 1}, ${fmt(date)}${done ? ', done' : ''}`} className={`grid aspect-square place-items-center rounded-xl border text-[11px] font-bold ${done ? 'border-[#315f43] bg-[#315f43] text-[#f7f5eb]' : today ? 'border-[#315f43] bg-[#e6edda] text-[#315f43]' : 'border-[#e0e3d8] text-[#8a968c]'}`}>{done ? <Check size={14}/> : i + 1}</div>; })}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {p.isActive && p.canCheckIn && <button type="button" disabled={busy} className="btn-primary disabled:opacity-60" onClick={() => run(() => check.mutateAsync({ slug: c.slug, data: { completed: !p.todayDone } }))} data-testid={`button-checkin-${c.slug}`}>{p.todayDone ? 'Undo today\'s check-in' : 'Check in for today'}</button>}
        {p.isActive ? <button type="button" disabled={busy} className="btn-secondary" onClick={() => run(() => join.mutateAsync({ slug: c.slug, data: { joined: false } }))} data-testid={`button-leave-${c.slug}`}>Leave</button> : !p.isFinished && <button type="button" disabled={busy} className="btn-secondary" onClick={() => run(() => join.mutateAsync({ slug: c.slug, data: { joined: true } }))} data-testid={`button-resume-${c.slug}`}>Resume</button>}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[#7a877c]">Check-ins and undo apply to today only. No back-filling or future days. {p.isFinished ? 'This window has finished and cannot restart.' : p.isActive ? 'Leaving keeps your progress and your original calendar; you can resume until the window ends.' : 'You have left. Your progress is kept and your original window continues to run.'}</p>
    </div>}
    {err && <p role="alert" className="mt-3 rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">{err}</p>}
  </article>;
}

export function ChallengesPage() {
  useSeo('Community challenges', 'Gentle 21-day food habit challenges. See anonymous community totals, then sign in to join and track your own check-ins.');
  const { signedIn } = useMemberSession();
  const list = usePublicChallenges();
  const mine = useMyChallenges();
  const byslug = new Map((signedIn ? mine.data ?? [] : []).map((p) => [p.challengeSlug, p]));
  return <div className="page-wrap py-11 md:py-16">
    <div className="max-w-2xl"><div className="eyebrow">Community challenges</div><h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Small habits, <span className="serif font-medium italic text-[#668052]">21 days.</span></h1>
      <p className="mt-4 text-sm leading-7 text-[#68766b]">One simple action a day. Totals shown are anonymous community counts: no names, no leaderboards, no chat. Your 21-day window starts the day you join (India time).</p></div>
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      {list.isLoading ? <><div className="skeleton h-72 rounded-[26px]"/><div className="skeleton h-72 rounded-[26px]"/></> : list.isError ? <div role="alert" className="rounded-[20px] bg-[#f0f1e8] p-8 text-center text-sm text-[#67776a]">Challenges did not load. <button type="button" className="btn-secondary ml-2" onClick={() => list.refetch()}>Try again</button></div> : !list.data?.length ? <p className="rounded-[20px] bg-[#f0f1e8] p-8 text-center text-sm text-[#67776a]">No challenges are open right now.</p> : list.data.map((c) => <Card key={c.slug} c={c} p={byslug.get(c.slug)} signedIn={signedIn} memberLoading={signedIn && mine.isLoading}/>)}
    </div>
    {signedIn && mine.isError && <p role="alert" className="mt-4 text-sm text-[#9b5142]">We could not load your progress. <button type="button" className="font-bold underline" onClick={() => mine.refetch()}>Retry</button></p>}
  </div>;
}
