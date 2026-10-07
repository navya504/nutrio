import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { SignIn, useClerk } from '@clerk/react';
import { useGetStaffAccess, getGetStaffAccessQueryKey } from '@workspace/api-client-react';
import { BookOpenCheck, Inbox, Loader2, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMemberSession } from '@/hooks/use-member';
import { ADMIN_SEO, useSeo } from '@/lib/seo';

export function errStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}
export function errText(e: unknown): string {
  const s = errStatus(e);
  if (s === 401) return 'Your session is not signed in (401). Sign in again, then retry. Your entries are still on screen.';
  if (s === 403) return 'This account does not have staff access (403). Nothing was saved. Your entries are still on screen.';
  const d = (e as { data?: { message?: string; error?: string } } | null)?.data;
  const m = d?.message || d?.error;
  return `${m ?? (e instanceof Error ? e.message : 'The request failed')}. Nothing was saved and your entries are still on screen.`;
}

const TABS = [['/admin', 'Overview', ShieldCheck], ['/admin/catalogue', 'Catalogue', BookOpenCheck], ['/admin/enquiries', 'Enquiries', Inbox]] as const;

function Frame({ path, role, children }: { path: string; role?: string; children: ReactNode }) {
  const [loc] = useLocation();
  const { signOut } = useClerk();
  const [t, d] = ADMIN_SEO[path] ?? ADMIN_SEO['/admin'];
  useSeo(t, d);
  return <div className="page-wrap py-8 md:py-12">
    <meta name="robots" content="noindex"/>
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d9ddcf] pb-5">
      <div><div className="eyebrow">Staff area</div><h1 className="font-display mt-1 text-3xl font-extrabold tracking-[-.06em] text-[#20352c]">Keep the menu honest.</h1></div>
      <div className="flex items-center gap-2">
        {role && <span className="rounded-md bg-[#20372d] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-[#d9e6bb]" data-testid="status-staff-role">{role}</span>}
        {role && <button type="button" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL || '/' })} className="btn-secondary !px-3 !py-2 !text-[12px]" data-testid="button-admin-sign-out"><LogOut size={14}/>Sign out</button>}
      </div>
    </div>
    {role && <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Staff navigation">{TABS.map(([href, label, Icon]) => <Link key={href} href={href} data-testid={`link-admin-${label.toLowerCase()}`} className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-bold no-underline ${loc === href ? 'bg-[#315f43] text-[#f7f5eb]' : 'text-[#52665a] hover:bg-[#e9eddf]'}`}><Icon size={15}/>{label}</Link>)}</nav>}
    <div className="mt-6">{children}</div>
  </div>;
}

export function StaffGate({ path, children }: { path: string; children: (role: string) => ReactNode }) {
  const { ready, signedIn } = useMemberSession();
  const access = useGetStaffAccess({ query: { enabled: signedIn, queryKey: getGetStaffAccessQueryKey(), retry: false, refetchInterval: 60000 } });
  if (!ready) return <Frame path={path}><div className="skeleton h-40 rounded-xl"/></Frame>;
  if (!signedIn) return <Frame path={path}>
    <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
      <div className="max-w-md"><h2 className="font-display text-2xl font-bold tracking-[-.05em] text-[#20352c]">Staff sign-in</h2><p className="mt-2 text-sm leading-6 text-[#68766b]">Sign in with your staff account. Access is checked on the server after sign-in; nothing sensitive loads before that.</p></div>
      <div data-testid="panel-staff-sign-in"><Link href="/admin/sign-in" className="btn-primary">Sign in to staff tools</Link></div>
    </div>
  </Frame>;
  if (access.isLoading) return <Frame path={path}><div className="flex items-center gap-3 rounded-xl border border-[#e0e3d8] bg-[#f0f1e8] p-6 text-sm text-[#52665a]" role="status"><Loader2 className="animate-spin" size={16}/>Checking staff access on the server</div></Frame>;
  if (access.isError || !access.data) {
    const s = errStatus(access.error);
    return <Frame path={path}><div className="rounded-xl border border-[#e3b9a9] bg-[#f6e1d8] p-6" role="alert" data-testid="status-access-denied">
      <div className="flex items-center gap-2 font-display text-lg font-bold text-[#7d3a28]"><ShieldAlert size={18}/>{s === 403 ? 'Not authorised (403)' : s === 401 ? 'Not signed in (401)' : 'Access check failed'}</div>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[#7d4a3b]">{s === 403 ? 'You are signed in, but this account has not been given staff access. Ask an admin to add it. No staff data was loaded.' : s === 401 ? 'The server did not accept your session. Sign out and sign in again.' : 'The server could not confirm staff access. No staff data was loaded.'}</p>
      <div className="mt-4 flex gap-2"><button type="button" className="btn-secondary" onClick={() => access.refetch()} data-testid="button-retry-access">Check again</button><Link href="/" className="btn-secondary">Back to site</Link></div>
    </div></Frame>;
  }
  return <Frame path={path} role={access.data.role}>{children(access.data.role)}</Frame>;
}

export function AdminHome() {
  return <StaffGate path="/admin">{(role) => <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
    <Link href="/admin/catalogue" className="rounded-2xl bg-[#315f43] p-7 text-[#f7f5eb] no-underline hover:bg-[#2a5239]" data-testid="card-admin-catalogue"><BookOpenCheck size={22}/><h2 className="font-display mt-6 text-2xl font-bold tracking-[-.05em]">Catalogue</h2><p className="mt-2 text-sm leading-6 text-[#d1ddcf]">Foods, recipes and gyms. Edit content and nutrition, switch availability, record verification. Listings are disabled, never deleted.</p></Link>
    <Link href="/admin/enquiries" className="rounded-2xl border border-[#e0e3d8] bg-[#fbfaf6] p-7 text-[#20352c] no-underline hover:bg-[#f0f1e8]" data-testid="card-admin-enquiries"><Inbox size={22} className="text-[#79924c]"/><h2 className="font-display mt-6 text-2xl font-bold tracking-[-.05em]">Enquiries</h2><p className="mt-2 text-sm leading-6 text-[#68766b]">Orders, partnerships and contact messages with status and staff notes.</p></Link>
    <p className="rounded-xl border border-[#e0bf7d] bg-[#f6e8c6] p-4 text-[13px] leading-6 text-[#6c4f14] md:col-span-2" data-testid="text-notification-note">Staff notifications are off until a receiving account is selected. New enquiries will not alert anyone; check the Enquiries page. Signed in as {role}.</p>
  </div>}</StaffGate>;
}

export function StaffSignInPage() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <Frame path="/admin"><div className="flex justify-center py-8"><SignIn routing="path" path={`${base}/admin/sign-in`} signUpUrl={`${base}/sign-up`} forceRedirectUrl={`${base}/admin`}/></div></Frame>;
}
