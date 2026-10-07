import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Download, Heart, Leaf, Minus, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import {
  getGetMemberPlansQueryKey, getGetMemberProfileQueryKey,
  useCreateMemberPlan, useDeleteMemberPlan, useGetMemberCatalogue, useSaveMemberProfile, useUpdateMemberPlan,
  useSetMemberFavourite, getGetMemberFavouritesQueryKey,
} from '@workspace/api-client-react';
import type { MealEntry, MealPlan, MemberProfile, NutritionTotals } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { usePlanLeaveWarning } from '@/hooks/use-plan-leave-warning';
import { clearPlanDraft, readPlanDraft, writePlanDraft } from '@/lib/plan-draft';
import { useEnquiries, useFavourites, useMemberSession, usePlans, useProfile } from '@/hooks/use-member';
import { GOALS } from '@/lib/discovery';
import { DISCLAIMER } from '@/lib/disclaimer';
import {
  type Catalogue, type DraftEntry, DAY_NAMES, MEALS, MEAL_LABEL, buildCsv, buildHtml, dailyTotals, dayLabel,
  downloadText, entryTotals, itemInfo, slugify, sumEntries,
} from '@/lib/plan';
import { EnquiryConversation, UnreadBadge } from '@/components/enquiry-conversation';
import heroBowl from '../assets/hero-bowl.jpg';

const TABS = [
  ['/member', 'Overview'], ['/member/profile', 'Profile and goals'], ['/member/saved', 'Saved'], ['/member/plans', 'Meal plans'], ['/member/enquiries', 'Enquiries'],
  ['/assistant', 'Ask Nutrio'], ['/challenges', 'Challenges'],
];
const GOAL_OPTIONS: [MemberProfile['goal'], string][] = GOALS.map((g) => [g.id as MemberProfile['goal'], g.label]);
const goalLabel = (g?: string) => GOALS.find((x) => x.id === g)?.label ?? 'Not chosen yet';

function MemberLayout({ title, lead, children, path }: { title: string; lead: string; children: ReactNode; path: string }) {
  const s = useMemberSession();
  return <div className="page-wrap py-9 md:py-14">
    <div className="eyebrow">{s.firstName ? `${s.firstName}'s space` : 'Your space'}</div>
    <h1 className="font-display mt-2 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-5xl" data-testid="text-member-title">{title}</h1>
    <p className="mt-3 max-w-xl text-sm leading-7 text-[#68766b]">{lead}</p>
    <nav aria-label="Your space" className="mobile-scroll no-print mt-6 flex gap-2 overflow-x-auto pb-1">{TABS.map(([href, label]) => <Link key={href} href={href} data-testid={`link-member-tab-${(href === '/member' ? 'overview' : href.split('/').pop())}`} className={`chip whitespace-nowrap no-underline ${path === href ? '!border-[#315f43] !bg-[#315f43] !text-[#f7f5eb]' : ''}`}>{label}</Link>)}</nav>
    <div className="mt-8">{children}</div>
  </div>;
}

function Problem({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return <div className="rounded-[20px] border border-[#e0e4d8] bg-[#f0f1e8] px-6 py-10 text-center" role="alert"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#f3dfd7] text-[#9b5142]"><X size={19}/></div><h3 className="font-display mt-4 text-xl font-bold text-[#263e30]">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#67776a]">{message}</p><button type="button" className="btn-secondary mt-5" onClick={retry} data-testid="button-member-retry">Try again</button></div>;
}
function Empty({ icon, title, body, href, cta }: { icon: ReactNode; title: string; body: string; href?: string; cta?: string }) {
  return <div className="rounded-[24px] border border-dashed border-[#ccd5c3] bg-[#f0f1e8] px-6 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#dce7cb] text-[#315f43]">{icon}</div><h3 className="font-display mt-4 text-2xl font-bold text-[#304937]">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b796d]">{body}</p>{href && <Link href={href} className="btn-primary mt-5">{cta} <ArrowRight size={15}/></Link>}</div>;
}
function Skel({ n = 3 }: { n?: number }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton h-32 rounded-[20px]"/>)}</div>;
}
const Disc = ({ className = '' }: { className?: string }) => <p className={`text-[11px] leading-5 text-[#7a877c] ${className}`} data-testid="text-member-disclaimer">{DISCLAIMER}</p>;

function useCatalogue() {
  const q = useGetMemberCatalogue();
  const cat = useMemo<Catalogue>(() => ({ foods: new Map((q.data?.foods || []).map((f) => [f.slug, f])), recipes: new Map((q.data?.recipes || []).map((r) => [r.slug, r])) }), [q.data]);
  // Selectable lists exclude inactive entries; the maps above keep them so saved plans still resolve.
  const foods = useMemo(() => ({ data: (q.data?.foods || []).filter((f) => f.available !== false) }), [q.data]);
  const recipes = useMemo(() => ({ data: (q.data?.recipes || []).filter((r) => r.available !== false) }), [q.data]);
  return { cat, foods, recipes, loading: q.isLoading, error: q.isError, retry: () => { q.refetch(); } };
}

const Stat = ({ label, value, unit }: { label: string; value: string | number; unit?: string }) => <div className="px-3 py-1 text-center"><div className="font-display text-xl font-bold text-[#315f43]">{value}<small className="ml-0.5 text-[10px] font-medium">{unit}</small></div><div className="text-[10px] text-[#738075]">{label}</div></div>;
function TotalsStrip({ t, className = '' }: { t: NutritionTotals; className?: string }) {
  return <div className={`grid grid-cols-3 divide-x divide-[#e0e3d8] rounded-2xl border border-[#e0e3d8] bg-[#f0f1e8] py-3 sm:grid-cols-6 ${className}`}><Stat label="Energy" value={t.calories} unit="kcal"/><Stat label="Protein" value={t.proteinG} unit="g"/><Stat label="Carbs" value={t.carbsG} unit="g"/><Stat label="Fat" value={t.fatG} unit="g"/><Stat label="Fibre" value={t.fiberG} unit="g"/><Stat label="Est. cost" value={`₹${t.costInRupees}`}/></div>;
}

/* ---------- Overview ---------- */
export function MemberOverview() {
  const profile = useProfile(); const favs = useFavourites(); const plans = usePlans(); const enq = useEnquiries(); const s = useMemberSession();
  const latest = plans.data?.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const name = profile.data?.displayName || s.firstName || 'there';
  const card = 'rounded-[22px] border border-[#e0e3d8] bg-[#fbfaf6] p-6';
  return <MemberLayout path="/member" title={`Hello, ${name}.`} lead="Your goals, saved food and plans in one calm place. Nothing here is medical advice, just practical help for everyday eating.">
    <div className="grid gap-5 md:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-[26px] bg-[#315f43] p-7 text-[#f7f5eb]" data-testid="card-member-goal"><div className="eyebrow !text-[#d5e6b7]">Your goal</div>
        {profile.isLoading ? <div className="skeleton mt-4 h-16 rounded-xl opacity-30"/> : <><h2 className="font-display mt-3 text-3xl font-bold tracking-[-.05em]">{profile.isError ? 'Set your goal' : goalLabel(profile.data?.goal)}</h2>
          <p className="mt-2 text-sm text-[#d1ddcf]">{profile.data && !profile.isError ? `Aiming for about ${profile.data.dailyCalories} kcal and ${profile.data.dailyProteinG} g protein a day.` : 'Tell us your daily targets so your plans have something to measure against.'}</p></>}
        <Link href="/member/profile" className="btn-primary mt-5 !border-[#d9e6bb] !bg-[#d9e6bb] !text-[#20352c]" data-testid="link-overview-profile">Edit profile and goals <ArrowRight size={15}/></Link></div>
      <div className="grid gap-5 sm:grid-cols-3 md:grid-cols-1">
        {[['Saved items', favs.isLoading ? '–' : favs.data?.length ?? 0, '/member/saved'], ['Meal plans', plans.isLoading ? '–' : plans.data?.length ?? 0, '/member/plans'], ['Enquiries', enq.isLoading ? '–' : enq.data?.length ?? 0, '/member/enquiries']].map(([l, v, h]) => <Link key={String(l)} href={String(h)} className={`${card} !p-5 text-inherit no-underline hover:bg-[#f0f1e8]`} data-testid={`link-overview-${String(h).split('/')[2]}`}><div className="eyebrow">{l}</div><div className="font-display mt-1 text-3xl font-extrabold text-[#20352c]">{v}</div></Link>)}
      </div>
    </div>
    <div className={`${card} mt-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Latest plan</div><h2 className="font-display mt-1 text-2xl font-bold tracking-[-.04em] text-[#20352c]">{latest ? latest.name : 'No plans yet'}</h2></div><Link href="/member/plans" className="btn-secondary" data-testid="link-overview-new-plan">{latest ? 'Open plans' : 'Build your first plan'} <CalendarDays size={15}/></Link></div>
      {plans.isError ? <p className="mt-3 text-sm text-[#9b5142]">We could not load your plans just now.</p> : latest && <TotalsStrip t={latest.totals} className="mt-4"/>}
      {latest && <p className="mt-2 text-[11px] text-[#7a877c]">{latest.days === 7 ? 'Totals for all seven days.' : 'Totals for one day.'}</p>}</div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2"><Link href="/assistant" className={`${card} text-inherit no-underline hover:bg-[#f0f1e8]`} data-testid="link-overview-assistant"><div className="eyebrow">Ask Nutrio</div><p className="mt-1 text-sm text-[#68766b]">Private AI chat for everyday food questions.</p></Link><Link href="/challenges" className={`${card} text-inherit no-underline hover:bg-[#f0f1e8]`} data-testid="link-overview-challenges"><div className="eyebrow">Challenges</div><p className="mt-1 text-sm text-[#68766b]">Join a 21-day habit and check in daily.</p></Link></div>
    <Disc className="mt-6"/>
  </MemberLayout>;
}

/* ---------- Profile ---------- */
type ProfileDraft = { displayName: string; goal: MemberProfile['goal']; dietaryPreference: MemberProfile['dietaryPreference']; dailyCalories: string; dailyProteinG: string };
export function MemberProfilePage() {
  const profile = useProfile(); const s = useMemberSession(); const qc = useQueryClient(); const { toast } = useToast();
  const save = useSaveMemberProfile({ mutation: { onSuccess: (p) => { qc.setQueryData(getGetMemberProfileQueryKey(), p); toast({ title: 'Profile saved' }); } } });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const settled = profile.isSuccess || profile.isError;
  const inited = useRef(false);
  useEffect(() => {
    if (!settled || inited.current) return;
    inited.current = true;
    const d = profile.data;
    setDraft({ displayName: d?.displayName ?? s.firstName, goal: d?.goal ?? 'healthy', dietaryPreference: d?.dietaryPreference ?? 'any', dailyCalories: String(d?.dailyCalories ?? 2000), dailyProteinG: String(d?.dailyProteinG ?? 60) });
  }, [settled, profile.data, s.firstName]);
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const kcal = Number(draft?.dailyCalories), pro = Number(draft?.dailyProteinG);
  const invalid = !draft || !draft.displayName.trim() || !(kcal >= 500 && kcal <= 10000) || !(pro >= 0 && pro <= 500);
  return <MemberLayout path="/member/profile" title="Profile and goals" lead="These help us frame your plans. They are rough targets you can change any time.">
    {!draft ? <div className="skeleton h-72 max-w-2xl rounded-[24px]"/> :
      <form className="grid max-w-2xl gap-4 rounded-[24px] border border-[#e0e3d8] bg-[#fbfaf6] p-6 md:p-8" onSubmit={(e) => { e.preventDefault(); if (!invalid) save.mutate({ data: { displayName: draft.displayName.trim(), goal: draft.goal, dietaryPreference: draft.dietaryPreference, dailyCalories: Math.round(kcal), dailyProteinG: Math.round(pro) } }); }}>
        {profile.isError && <div role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">We could not load a saved profile, so these are starting values. <button type="button" className="font-bold underline" onClick={() => profile.refetch()}>Retry</button></div>}
        <label className="field-label">Name we should use<input className="field" maxLength={120} value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} data-testid="input-profile-name"/></label>
        <label className="field-label">What are you working towards?<select className="field field-select" value={draft.goal} onChange={(e) => set('goal', e.target.value as ProfileDraft['goal'])} data-testid="select-profile-goal">{GOAL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field-label">Food preference<select className="field field-select" value={draft.dietaryPreference} onChange={(e) => set('dietaryPreference', e.target.value as ProfileDraft['dietaryPreference'])} data-testid="select-profile-diet"><option value="any">I eat everything</option><option value="vegetarian">Vegetarian</option></select></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Daily energy target (kcal)<input className="field" type="number" min={500} max={10000} inputMode="numeric" value={draft.dailyCalories} onChange={(e) => set('dailyCalories', e.target.value)} data-testid="input-profile-calories"/></label><label className="field-label">Daily protein target (g)<input className="field" type="number" min={0} max={500} inputMode="numeric" value={draft.dailyProteinG} onChange={(e) => set('dailyProteinG', e.target.value)} data-testid="input-profile-protein"/></label></div>
        {invalid && <p className="text-xs text-[#9b5142]">Add a name, energy between 500 and 10000 kcal, and protein between 0 and 500 g.</p>}
        {save.isError && <div role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">That did not save. Please try again.</div>}
        <button type="submit" disabled={invalid || save.isPending} className="btn-primary w-full disabled:opacity-60 sm:w-auto sm:justify-self-start" data-testid="button-save-profile"><Save size={16}/> {save.isPending ? 'Saving...' : 'Save profile'}</button>
        <Link href="/nutrition/calorie-calculator" className="text-xs font-bold text-[#58704e]">Not sure of your numbers? Try the calorie check.</Link>
        <Disc/>
      </form>}
  </MemberLayout>;
}

/* ---------- Saved ---------- */
export function MemberSavedPage() {
  const favs = useFavourites(); const { cat, loading, error, retry } = useCatalogue(); const qc = useQueryClient();
  const remove = useSetMemberFavourite({ mutation: { onSuccess: (l) => qc.setQueryData(getGetMemberFavouritesQueryKey(), l) } });
  const list = favs.data ?? [];
  const row = (kind: 'food' | 'recipe', slug: string) => {
    const f = kind === 'food' ? cat.foods.get(slug) : cat.recipes.get(slug);
    const i = itemInfo(cat, kind, slug);
    return <div key={`${kind}-${slug}`} className="flex gap-4 rounded-[20px] border border-[#e3e5db] bg-[#fbfaf6] p-3" data-testid={`row-saved-${kind}-${slug}`}>
      <Link href={`/${kind === 'food' ? 'food' : 'recipes'}/${slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#e9eddf]"><img src={f?.imageUrl || heroBowl} alt={f?.name ?? slug} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.src = heroBowl; }}/></Link>
      <div className="min-w-0 flex-1"><div className="eyebrow">{kind === 'food' ? 'Food' : 'Recipe'}</div><Link href={`/${kind === 'food' ? 'food' : 'recipes'}/${slug}`} className="font-display block truncate text-lg font-bold tracking-[-.04em] text-[#20352c] no-underline">{i?.name ?? slug}</Link>{i && <div className="mt-1 text-[11px] text-[#68766b]">{i.calories} kcal / {i.proteinG}g protein / ₹{i.costInRupees}</div>}</div>
      <button type="button" aria-label={`Remove ${i?.name ?? slug} from saved`} disabled={remove.isPending} onClick={() => remove.mutate({ data: { kind, slug, saved: false } })} data-testid={`button-unsave-${kind}-${slug}`} className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-full text-[#9b5142] hover:bg-[#f3dfd7]"><Trash2 size={16}/></button>
    </div>;
  };
  const section = (kind: 'food' | 'recipe', title: string) => { const items = list.filter((f) => f.kind === kind); return items.length ? <section className="mt-6"><h2 className="font-display mb-3 text-2xl font-bold tracking-[-.045em] text-[#20352c]">{title}</h2><div className="grid gap-3 md:grid-cols-2">{items.map((f) => row(kind, f.slug))}</div></section> : null; };
  return <MemberLayout path="/member/saved" title="Saved for later" lead="Foods and recipes you have hearted, ready to drop into a plan.">
    {favs.isLoading || loading ? <Skel/> : favs.isError || error ? <Problem title="We could not load your saved items" message="Please try again in a moment." retry={() => { favs.refetch(); retry(); }}/> : !list.length ? <Empty icon={<Heart size={20}/>} title="Nothing saved yet" body="Tap the heart on any food or recipe and it will wait for you here." href="/food" cta="Browse the menu"/> : <>{section('food', 'Foods')}{section('recipe', 'Recipes')}</>}
    {remove.isError && <p role="alert" className="mt-4 text-xs text-[#9b5142]">That did not update. Please try again.</p>}
    <Disc className="mt-8"/>
  </MemberLayout>;
}

/* ---------- Enquiries ---------- */
export function MemberEnquiriesPage() {
  const q = useEnquiries(); const { cat } = useCatalogue(); const [open, setOpen] = useState('');
  const fmt = (s: string) => { const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };
  return <MemberLayout path="/member/enquiries" title="Your enquiries" lead="Orders, messages and partnership enquiries you sent while signed in, with replies from the team.">
    <div className="mb-6 rounded-2xl border border-[#e0bf7d] bg-[#f6e8c6] p-4 text-sm leading-6 text-[#6c4f14]" data-testid="text-enquiry-notice">These are enquiries, not confirmed orders. No payment is taken here and nothing is reserved until the team gets back to you. Enquiries sent before you signed in do not appear.</div>
    {q.isLoading ? <Skel n={2}/> : q.isError ? <Problem title="We could not load your enquiries" message="Please try again in a moment." retry={() => q.refetch()}/> : !q.data?.length ? <Empty icon={<Leaf size={20}/>} title="No enquiries yet" body="When you send a pickup enquiry from your bag while signed in, it will be listed here." href="/food" cta="Browse the menu"/> :
      <div className="grid gap-4">{q.data.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((e) => <article key={e.id} className="rounded-[22px] border border-[#e0e3d8] bg-[#fbfaf6] p-5" data-testid={`card-enquiry-${e.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">{e.kind} / {fmt(e.submittedAt)}</div><h2 className="font-display mt-1 text-xl font-bold tracking-[-.04em] text-[#20352c]">{e.kind === 'order' && e.itemCount != null ? `${e.itemCount} item${e.itemCount === 1 ? '' : 's'}${e.totalInRupees != null ? ` / estimated ₹${e.totalInRupees}` : ''}` : e.subject}</h2></div><div className="flex items-center gap-2"><UnreadBadge n={e.unreadCount} label="new replies"/><span className="rounded-full border border-[#e0bf7d] bg-[#f6e8c6] px-3 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#7b5b17]" data-testid={`status-enquiry-${e.id}`}>{e.status}</span></div></div>
        {e.kind === 'order' && e.pickupLocation && <p className="mt-2 text-xs text-[#68766b]">Pickup: {e.pickupLocation}{e.pickupTime ? `, ${e.pickupTime}` : ''}</p>}
        {e.kind !== 'order' && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#42584a]">{e.detail}</p>}
        {!!e.items?.length && <ul className="mt-3 grid gap-1 border-t border-[#e6e8df] pt-3 text-xs text-[#42584a]">{e.items.map((it) => <li key={it.foodSlug}>{it.quantity} x {cat.foods.get(it.foodSlug)?.name ?? it.foodSlug}</li>)}</ul>}
        <p className="mt-3 text-[11px] text-[#7a877c]">Reference {e.id}</p>
        <button type="button" className="btn-secondary mt-3" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? '' : e.id)} data-testid={`button-toggle-conversation-${e.id}`}>{open === e.id ? 'Hide messages' : 'Messages'}</button>
        {open === e.id && <EnquiryConversation role="member" kind={e.kind} id={e.enquiryId}/>}</article>)}</div>}
  </MemberLayout>;
}

/* ---------- Plans ---------- */
type Draft = { id: number | null; name: string; days: 1 | 7; entries: DraftEntry[] };
let keySeq = 0;
const nk = () => `e${++keySeq}`;
const newDraft = (): Draft => ({ id: null, name: 'My eating plan', days: 1, entries: [] });
const fromPlan = (p: MealPlan): Draft => ({ id: p.id, name: p.name, days: p.days as 1 | 7, entries: p.entries.map((e) => ({ ...e, key: nk() })) });
const clampServ = (n: number) => Math.min(20, Math.max(0.25, Math.round(n * 4) / 4));

export function MemberPlansPage() {
  const { userId } = useMemberSession();
  const plans = usePlans(); const { cat, loading, error, retry, foods, recipes } = useCatalogue();
  const qc = useQueryClient(); const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [storageError, setStorageError] = useState(false);
  usePlanLeaveWarning(dirty, recoveryAvailable);
  const persist = (d: Draft) => {
    if (!userId) return;
    try { writePlanDraft(userId, d); setRecoveryAvailable(true); setStorageError(false); }
    catch { setRecoveryAvailable(false); setStorageError(true); }
  };
  const clearRecovery = () => {
    if (!userId) return;
    try { clearPlanDraft(userId); setStorageError(false); }
    catch { setStorageError(true); }
    setRecovered(false); setRecoveryAvailable(false);
  };
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || !plans.isSuccess || !userId) return;
    initialised.current = true;
    try {
      const copy = readPlanDraft(userId);
      if (copy) {
        setDraft({ ...copy, id: null, entries: copy.entries.map((e) => ({ ...e, key: nk() })) });
        setDirty(true); setRecovered(true); setRecoveryAvailable(true);
        return;
      }
    } catch { setStorageError(true); }
    const first = plans.data.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (first) setDraft(fromPlan(first));
  }, [plans.isSuccess, plans.data, userId]);
  const refresh = () => qc.invalidateQueries({ queryKey: getGetMemberPlansQueryKey() });
  const onSaved = (p: MealPlan) => { clearRecovery(); setDraft(fromPlan(p)); setDirty(false); refresh(); toast({ title: 'Plan saved' }); };
  const create = useCreateMemberPlan({ mutation: { onSuccess: onSaved } });
  const update = useUpdateMemberPlan({ mutation: { onSuccess: onSaved } });
  const del = useDeleteMemberPlan({ mutation: { onSuccess: () => { clearRecovery(); setDraft(newDraft()); setDirty(false); setDay(0); setConfirmDelete(false); refresh(); toast({ title: 'Plan deleted' }); } } });
  const edit = (fn: (d: Draft) => Draft) => { if (create.isPending || update.isPending || del.isPending) return; const next = fn(draft); persist(next); setDraft(next); setDirty(true); };
  const open = (d: Draft) => { if (create.isPending || update.isPending || del.isPending) return; if (dirty && !window.confirm('You have unsaved changes. Discard them and their recovery copy?')) return; clearRecovery(); setDraft(d); setDirty(false); setDay(0); setConfirmDelete(false); };

  const entries: MealEntry[] = draft.entries;
  const totals = useMemo(() => sumEntries(cat, entries), [cat, entries]);
  const daily = useMemo(() => dailyTotals(cat, entries, draft.days), [cat, entries, draft.days]);
  const saving = create.isPending || update.isPending;
  const payload = () => ({ name: draft.name.trim(), days: draft.days, entries: draft.entries.map(({ key: _k, ...e }) => e) });
  const save = () => { if (!draft.name.trim()) return; draft.id === null ? create.mutate({ data: payload() }) : update.mutate({ id: draft.id, data: payload() }); };
  const setDays = (n: 1 | 7) => {
    if (n === draft.days || saving) return;
    if (n === 1 && draft.entries.some((e) => e.day > 0) && !window.confirm('Switch to one day? Meals on Tuesday through Sunday will be removed from this draft. Your saved plan will not change until you save.')) return;
    edit((d) => ({ ...d, days: n, entries: n === 1 ? d.entries.filter((e) => e.day === 0) : d.entries })); setDay(0);
  };

  // add-item picker
  const [q, setQ] = useState(''); const [kindTab, setKindTab] = useState<'all' | 'food' | 'recipe'>('all'); const [addMeal, setAddMeal] = useState<MealEntry['meal']>('lunch');
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = [...(foods.data || []).map((f) => ({ kind: 'food' as const, slug: f.slug, name: f.name, cal: f.calories })), ...(recipes.data || []).map((r) => ({ kind: 'recipe' as const, slug: r.slug, name: r.name, cal: r.calories }))];
    return all.filter((i) => (kindTab === 'all' || i.kind === kindTab) && (!t || i.name.toLowerCase().includes(t))).slice(0, 8);
  }, [q, kindTab, foods.data, recipes.data]);
  const add = (kind: 'food' | 'recipe', slug: string) => edit((d) => {
    const hit = d.entries.find((e) => e.day === day && e.meal === addMeal && e.kind === kind && e.slug === slug);
    return hit ? { ...d, entries: d.entries.map((e) => (e === hit ? { ...e, servings: clampServ(e.servings + 1) } : e)) } : { ...d, entries: [...d.entries, { key: nk(), day, meal: addMeal, kind, slug, servings: 1 }] };
  });
  const patch = (key: string, p: Partial<MealEntry>) => edit((d) => ({ ...d, entries: d.entries.map((e) => (e.key === key ? { ...e, ...p } : e)) }));
  const drop = (key: string) => edit((d) => ({ ...d, entries: d.entries.filter((e) => e.key !== key) }));
  const fname = slugify(draft.name);
  const dl = (type: 'html' | 'csv') => type === 'html' ? downloadText(`nutrio-${fname}.html`, 'text/html;charset=utf-8', buildHtml(draft.name || 'Meal plan', draft.days, entries, cat)) : downloadText(`nutrio-${fname}.csv`, 'text/csv;charset=utf-8', buildCsv(draft.name || 'Meal plan', draft.days, entries, cat));
  const sorted = (plans.data ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const dayEntries = draft.entries.filter((e) => e.day === day);
  const tools = 'inline-flex items-center gap-2 rounded-full border border-[#bdc9b5] px-4 py-2 text-xs font-bold text-[#20352c] hover:bg-[#e9eddf] disabled:opacity-50';

  return <MemberLayout path="/member/plans" title="Meal plans" lead="Plan one day or a full week. Change servings, shuffle meals between days, and see the totals as you go.">
    {plans.isLoading || loading ? <Skel n={3}/> : plans.isError || error ? <Problem title="We could not load your plans" message="Your saved plans or the menu did not load. Please try again." retry={() => { plans.refetch(); retry(); }}/> :
    <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
      <aside className="no-print"><div className="flex items-center justify-between"><h2 className="eyebrow">Your plans</h2><button type="button" onClick={() => open(newDraft())} className="inline-flex items-center gap-1 text-xs font-bold text-[#315f43]" data-testid="button-new-plan"><Plus size={14}/> New plan</button></div>
        <div className="mobile-scroll mt-3 flex gap-2 overflow-x-auto lg:grid lg:overflow-visible">{sorted.map((p) => <button key={p.id} type="button" onClick={() => open(fromPlan(p))} data-testid={`button-open-plan-${p.id}`} className={`min-w-[170px] rounded-2xl border p-3 text-left ${draft.id === p.id ? 'border-[#315f43] bg-[#e6edda]' : 'border-[#e0e3d8] bg-[#fbfaf6] hover:border-[#9db28f]'}`}><div className="font-display truncate text-sm font-bold text-[#20352c]">{p.name}</div><div className="mt-0.5 text-[11px] text-[#738075]">{p.days === 7 ? '7 days' : '1 day'} / {p.totals.calories} kcal</div></button>)}
          {!sorted.length && <p className="rounded-2xl bg-[#f0f1e8] p-4 text-xs leading-5 text-[#68766b]">No saved plans yet. Build one on the right and save it.</p>}</div></aside>

      <div className="min-w-0">
        <div className="no-print rounded-[24px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 md:p-6">
          {recovered && <div role="status" className="mb-4 rounded-xl bg-[#e9eddf] p-3 text-xs leading-5 text-[#315f43]" data-testid="status-plan-recovered">Your unfinished draft was recovered as a separate, unsaved plan. Saved plans are unchanged. Save this copy to keep it, or <button type="button" className="font-bold underline" onClick={() => open(sorted[0] ? fromPlan(sorted[0]) : newDraft())} data-testid="button-discard-recovered-plan">discard the draft</button>.</div>}
          {storageError && <p role="alert" className="mb-4 rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]" data-testid="status-plan-recovery-error">This browser could not store or clear your recovery copy. Save your plan before leaving. Recovery may be unavailable or out of date.</p>}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="field-label">Plan name<input className="field" maxLength={120} value={draft.name} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} data-testid="input-plan-name"/></label>
            <div role="group" aria-label="Plan length" className="flex gap-2"><button type="button" className="chip" aria-pressed={draft.days === 1} onClick={() => setDays(1)} data-testid="button-plan-1day">1 day</button><button type="button" className="chip" aria-pressed={draft.days === 7} onClick={() => setDays(7)} data-testid="button-plan-7day">7 days</button></div></div>
          {draft.days === 7 && <div role="tablist" aria-label="Day" className="mobile-scroll mt-4 flex gap-2 overflow-x-auto">{DAY_NAMES.map((n, i) => <button key={n} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)} data-testid={`button-day-${i}`} className="chip whitespace-nowrap">{n.slice(0, 3)}<span className="opacity-70">{daily[i]?.calories ?? 0}</span></button>)}</div>}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <div className="grid gap-4">{MEALS.map((meal) => { const list = dayEntries.filter((e) => e.meal === meal); return <section key={meal} data-testid={`section-meal-${meal}`}><h3 className="font-display text-base font-bold tracking-[-.03em] text-[#315f43]">{MEAL_LABEL[meal]} <span className="text-xs font-medium text-[#8a968c]">{Math.round(list.reduce((a, e) => a + entryTotals(cat, e).calories, 0))} kcal</span></h3>
              {!list.length ? <p className="mt-1 rounded-xl border border-dashed border-[#d3dacb] px-3 py-2 text-xs text-[#8a968c]">Nothing here yet.</p> : <ul className="mt-1 grid gap-2">{list.map((e) => { const info = itemInfo(cat, e.kind, e.slug); const t = entryTotals(cat, e); return <li key={e.key} className="rounded-xl border border-[#e3e5db] bg-white/60 p-3" data-testid={`row-entry-${e.key}`}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold text-[#20352c]">{info?.name ?? `${e.slug} (no longer on the menu)`}</div><div className="text-[11px] text-[#738075]">{Math.round(t.calories)} kcal / {Math.round(t.proteinG * 10) / 10}g protein / ₹{Math.round(t.costInRupees)}</div></div><button type="button" aria-label={`Remove ${info?.name ?? e.slug}`} onClick={() => drop(e.key)} data-testid={`button-remove-entry-${e.key}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#9b5142] hover:bg-[#f3dfd7]"><X size={15}/></button></div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <div className="flex items-center rounded-full border border-[#d5dccd]"><button type="button" aria-label="Fewer servings" onClick={() => patch(e.key, { servings: clampServ(e.servings - 0.25) })} className="grid h-8 w-8 place-items-center" data-testid={`button-serv-down-${e.key}`}><Minus size={13}/></button><span className="min-w-[44px] text-center font-bold" data-testid={`text-serv-${e.key}`}>{e.servings}</span><button type="button" aria-label="More servings" onClick={() => patch(e.key, { servings: clampServ(e.servings + 0.25) })} className="grid h-8 w-8 place-items-center" data-testid={`button-serv-up-${e.key}`}><Plus size={13}/></button></div>
                  <label className="sr-only" htmlFor={`m-${e.key}`}>Meal</label><select id={`m-${e.key}`} value={e.meal} onChange={(ev) => patch(e.key, { meal: ev.target.value as MealEntry['meal'] })} className="rounded-full border border-[#d5dccd] bg-[#fbfaf6] px-2 py-1.5" data-testid={`select-entry-meal-${e.key}`}>{MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select>
                  {draft.days === 7 && <><label className="sr-only" htmlFor={`d-${e.key}`}>Day</label><select id={`d-${e.key}`} value={e.day} onChange={(ev) => patch(e.key, { day: Number(ev.target.value) })} className="rounded-full border border-[#d5dccd] bg-[#fbfaf6] px-2 py-1.5" data-testid={`select-entry-day-${e.key}`}>{DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></>}
                </div></li>; })}</ul>}</section>; })}
              <div className="rounded-2xl bg-[#e9eddf] p-3"><div className="eyebrow">{dayLabel(day, draft.days)} total</div><TotalsStrip t={daily[day] ?? sumEntries(cat, [])} className="mt-2 !bg-[#fbfaf6]"/></div></div>

            <div className="rounded-2xl bg-[#f0f1e8] p-4"><h3 className="font-display text-lg font-bold tracking-[-.04em] text-[#20352c]">Add to {dayLabel(day, draft.days).toLowerCase()}</h3>
              <div className="mt-3 grid gap-2"><label className="relative block"><Search size={15} className="absolute left-3 top-3.5 text-[#8a968c]"/><input className="field !pl-9" placeholder="Search foods and recipes" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-plan-search"/></label>
                <div className="flex flex-wrap items-center gap-2">{(['all', 'food', 'recipe'] as const).map((k) => <button key={k} type="button" className="chip" aria-pressed={kindTab === k} onClick={() => setKindTab(k)} data-testid={`button-picker-${k}`}>{k === 'all' ? 'All' : k === 'food' ? 'Foods' : 'Recipes'}</button>)}
                  <select aria-label="Add to meal" value={addMeal} onChange={(e) => setAddMeal(e.target.value as MealEntry['meal'])} className="rounded-full border border-[#d5dccd] bg-[#fbfaf6] px-2 py-2 text-xs" data-testid="select-add-meal">{MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select></div></div>
              <ul className="mt-3 grid gap-2">{results.map((r) => <li key={`${r.kind}-${r.slug}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#fbfaf6] px-3 py-2"><div className="min-w-0"><div className="truncate text-xs font-bold text-[#20352c]">{r.name}</div><div className="text-[10px] text-[#8a968c]">{r.kind === 'food' ? 'Food' : 'Recipe'} / {r.cal} kcal</div></div><button type="button" aria-label={`Add ${r.name}`} onClick={() => add(r.kind, r.slug)} data-testid={`button-add-${r.kind}-${r.slug}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e6edda] text-[#315f43] hover:bg-[#d5e2c1]"><Plus size={15}/></button></li>)}{!results.length && <li className="rounded-xl bg-[#fbfaf6] p-3 text-xs text-[#8a968c]">Nothing matches that search.</li>}</ul></div>
          </div>

          {(create.isError || update.isError || del.isError) && <div role="alert" className="mt-4 rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">That did not go through. Check the plan has a name and servings between 0.25 and 20, then try again.</div>}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#e6e8df] pt-4">
            <button type="button" onClick={save} disabled={saving || !draft.name.trim()} className="btn-primary disabled:opacity-60" data-testid="button-save-plan"><Save size={16}/> {saving ? 'Saving...' : draft.id === null ? 'Save plan' : 'Save changes'}</button>
            {dirty && <span className="text-[11px] font-bold text-[#7b5b17]" data-testid="status-plan-unsaved">Unsaved changes{recoveryAvailable ? ' · Recovery copy on this browser' : ''}</span>}
            <span className="flex-1"/>
            <button type="button" className={tools} onClick={() => window.print()} data-testid="button-print-plan"><Printer size={14}/> Print</button>
            <button type="button" className={tools} onClick={() => dl('html')} data-testid="button-download-html"><Download size={14}/> HTML</button>
            <button type="button" className={tools} onClick={() => dl('csv')} data-testid="button-download-csv"><Download size={14}/> CSV</button>
            {draft.id !== null && (confirmDelete ? <><button type="button" className={`${tools} !border-[#9b5142] !text-[#9b5142]`} disabled={del.isPending} onClick={() => del.mutate({ id: draft.id as number })} data-testid="button-confirm-delete-plan">Yes, delete</button><button type="button" className={tools} onClick={() => setConfirmDelete(false)}>Keep it</button></> : <button type="button" className={tools} onClick={() => setConfirmDelete(true)} data-testid="button-delete-plan"><Trash2 size={14}/> Delete</button>)}
          </div>
        </div>

        <div className="print-area mt-6 rounded-[24px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 md:p-6" data-testid="section-plan-sheet">
          <div className="eyebrow">Nutrio plan sheet</div><h2 className="font-display mt-1 text-2xl font-bold tracking-[-.045em] text-[#20352c]">{draft.name || 'Untitled plan'} <span className="text-sm font-medium text-[#8a968c]">{draft.days === 7 ? '7 days' : '1 day'}</span></h2>
          {Array.from({ length: draft.days }, (_, d) => { const list = draft.entries.filter((e) => e.day === d); return <div key={d} className="mt-4"><h3 className="text-sm font-bold text-[#315f43]">{dayLabel(d, draft.days)}</h3>
            <div className="overflow-x-auto"><table className="mt-1 w-full min-w-[560px] border-collapse text-[11px]"><thead><tr className="bg-[#e9eddf] text-left"><th className="p-1.5">Meal</th><th className="p-1.5">Item</th><th className="p-1.5">Serv.</th><th className="p-1.5">kcal</th><th className="p-1.5">P g</th><th className="p-1.5">C g</th><th className="p-1.5">F g</th><th className="p-1.5">Fibre g</th><th className="p-1.5">Cost</th></tr></thead><tbody>
              {MEALS.flatMap((m) => list.filter((e) => e.meal === m)).map((e) => { const t = entryTotals(cat, e); return <tr key={e.key} className="border-b border-[#e6e8df]"><td className="p-1.5">{MEAL_LABEL[e.meal]}</td><td className="p-1.5">{itemInfo(cat, e.kind, e.slug)?.name ?? e.slug}</td><td className="p-1.5">{e.servings}</td><td className="p-1.5">{Math.round(t.calories)}</td><td className="p-1.5">{Math.round(t.proteinG * 10) / 10}</td><td className="p-1.5">{Math.round(t.carbsG * 10) / 10}</td><td className="p-1.5">{Math.round(t.fatG * 10) / 10}</td><td className="p-1.5">{Math.round(t.fiberG * 10) / 10}</td><td className="p-1.5">₹{Math.round(t.costInRupees)}</td></tr>; })}
              {!list.length && <tr><td colSpan={9} className="p-1.5 italic text-[#8a968c]">Nothing planned</td></tr>}
              <tr className="bg-[#dce8c8] font-bold" data-testid={`row-day-total-${d}`}><td className="p-1.5" colSpan={3}>Day total</td><td className="p-1.5">{daily[d].calories}</td><td className="p-1.5">{daily[d].proteinG}</td><td className="p-1.5">{daily[d].carbsG}</td><td className="p-1.5">{daily[d].fatG}</td><td className="p-1.5">{daily[d].fiberG}</td><td className="p-1.5">₹{daily[d].costInRupees}</td></tr></tbody></table></div></div>; })}
          <div className="mt-5"><div className="eyebrow">Overall {draft.days === 7 ? 'week' : 'day'}</div><div data-testid="totals-overall"><TotalsStrip t={totals} className="mt-2"/></div></div>
          <Disc className="mt-4"/>
        </div>
      </div>
    </div>}
  </MemberLayout>;
}

export function useMemberRedirectHome() {
  const [, go] = useLocation();
  return () => go('/');
}
