import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Inbox, Search } from 'lucide-react';
import {
  getGetStaffEnquiriesQueryKey, useGetStaffEnquiries, useUpdateStaffEnquiry,
} from '@workspace/api-client-react';
import type { StaffEnquiry } from '@workspace/api-client-react';
import { StaffGate, errText } from '@/pages/admin';
import { EnquiryConversation, UnreadBadge } from '@/components/enquiry-conversation';

const STATUSES = ['received', 'reviewing', 'confirmed', 'fulfilled', 'declined', 'closed'] as const;
const TONE: Record<string, string> = {
  received: 'bg-[#f6e8c6] text-[#7b5b17]', reviewing: 'bg-[#dbe7ee] text-[#2f5568]', confirmed: 'bg-[#dce8c8] text-[#315f43]',
  fulfilled: 'bg-[#315f43] text-[#f7f5eb]', declined: 'bg-[#f2d9d0] text-[#8a3f2d]', closed: 'bg-[#e4e6dc] text-[#5b665e]',
};
const fmt = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function Detail({ e }: { e: StaffEnquiry }) {
  const qc = useQueryClient();
  const m = useUpdateStaffEnquiry();
  const [status, setStatus] = useState<string>(e.status);
  const [note, setNote] = useState(e.staffNote);
  const [ok, setOk] = useState('');
  const baseline = useRef({ status: e.status as string, note: e.staffNote });
  useEffect(() => {
    // Refresh a clean form, but never overwrite an in-progress staff note on polling.
    if (status === baseline.current.status && note === baseline.current.note) {
      setStatus(e.status); setNote(e.staffNote);
    }
    baseline.current = { status: e.status, note: e.staffNote };
  }, [e.status, e.staffNote]);
  const allowed = STATUSES.filter((s) => e.kind === 'order' || (s !== 'confirmed' && s !== 'fulfilled') || s === e.status);
  const dirty = status !== e.status || note !== e.staffNote;
  const save = () => {
    setOk('');
    m.mutate({ kind: e.kind, id: e.id, data: { status: status as StaffEnquiry['status'], staffNote: note } }, {
      onSuccess: (r) => {
        qc.setQueryData<StaffEnquiry[]>(getGetStaffEnquiriesQueryKey(), (old) => old?.map((x) => (x.kind === r.kind && x.id === r.id ? r : x)));
        qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/') });
        setOk(`Saved ${e.reference} as ${r.status}.`);
      },
    });
  };
  const rows: [string, string][] = [['Reference', e.reference], ['Kind', e.kind], ['Name', e.name], ['Email', e.email || 'Not given'], ['Phone', e.phone || 'Not given'], ['Received', fmt(e.createdAt)], ['Record id', String(e.id)]];
  return <div className="rounded-2xl border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-6" data-testid={`panel-enquiry-${e.kind}-${e.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">{e.kind} / {e.reference}</div><h2 className="font-display mt-1 text-xl font-bold tracking-[-.04em] text-[#20352c]">{e.subject}</h2></div><span className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em] ${TONE[e.status]}`}>{e.status}</span></div>
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="flex gap-3 border-b border-[#eceee4] py-1.5"><dt className="w-20 shrink-0 text-[#7a877c]">{k}</dt><dd className="min-w-0 break-words font-semibold text-[#20352c]">{v}</dd></div>)}</dl>
    <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[.12em] text-[#7a877c]">Detail</h3>
    <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#f0f1e8] p-4 font-sans text-[13px] leading-6 text-[#31473a]" data-testid="text-enquiry-detail">{e.detail}</pre>
    <EnquiryConversation role="staff" kind={e.kind} id={e.id}/>
    <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[.12em] text-[#7a877c]">Private staff note and status (never shown to the member)</h3>
    <div className="mt-2 grid gap-4">
      <label className="field-label">Status<select className="field field-select" value={status} onChange={(x) => setStatus(x.target.value)} data-testid="select-enquiry-status">{allowed.map((s) => <option key={s} value={s}>{s}</option>)}</select>{e.kind !== 'order' && <span className="text-[11px] font-normal text-[#7a877c]">Confirmed and fulfilled apply to orders only.</span>}</label>
      <label className="field-label">Staff note ({note.length}/2000)<textarea className="field min-h-[110px]" maxLength={2000} value={note} onChange={(x) => setNote(x.target.value)} data-testid="input-staff-note"/></label>
    </div>
    {m.isError && <p className="mt-4 rounded-lg bg-[#f6e1d8] p-3 text-[13px] text-[#7d3a28]" role="alert" data-testid="status-enquiry-error">{errText(m.error)}</p>}
    {ok && !dirty && <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#dce8c8] p-3 text-[13px] font-semibold text-[#315f43]" role="status" data-testid="status-enquiry-saved"><Check size={15}/>{ok}</p>}
    <div className="mt-4"><button type="button" className="btn-primary" disabled={!dirty || m.isPending} onClick={save} data-testid="button-save-enquiry">{m.isPending ? 'Saving' : 'Save changes'}</button></div>
  </div>;
}

function Enquiries() {
  const q = useGetStaffEnquiries({ query: { queryKey: getGetStaffEnquiriesQueryKey(), refetchInterval: 20000, refetchOnWindowFocus: true } });
  const [sel, setSel] = useState('');
  const [kind, setKind] = useState('all');
  const [st, setSt] = useState('all');
  const [text, setText] = useState('');
  const list = useMemo(() => (q.data ?? []).filter((e) => (kind === 'all' || e.kind === kind) && (st === 'all' || e.status === st) && `${e.reference} ${e.name} ${e.email} ${e.subject} ${e.detail}`.toLowerCase().includes(text.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [q.data, kind, st, text]);
  const current = (q.data ?? []).find((e) => `${e.kind}-${e.id}` === sel);
  return <div>
    <p className="mb-4 text-[12px] text-[#7a877c]" data-testid="text-enquiry-notify">Notifications are off until a receiving account is selected. This list refreshes every 20 seconds.</p>
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div>
        <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718073]"/><input className="field !py-2.5 pl-10" placeholder="Search name, reference, text" value={text} onChange={(e) => setText(e.target.value)} data-testid="input-enquiry-search"/></div>
        <div className="mt-2 grid grid-cols-2 gap-2"><select className="field field-select !py-2" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" data-testid="select-filter-kind"><option value="all">All kinds</option><option value="order">Orders</option><option value="partnership">Partnerships</option><option value="contact">Contact</option></select><select className="field field-select !py-2" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status" data-testid="select-filter-status"><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="mt-3 grid max-h-[640px] gap-1.5 overflow-y-auto">
          {q.isLoading ? [1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-lg"/>) : q.isError ? <div className="rounded-lg bg-[#f6e1d8] p-4 text-[13px] text-[#7d3a28]" role="alert">{errText(q.error)}<button type="button" className="btn-secondary mt-3" onClick={() => q.refetch()} data-testid="button-retry-enquiries">Try again</button></div> : list.length ? list.map((e) => <button key={`${e.kind}-${e.id}`} type="button" onClick={() => setSel(`${e.kind}-${e.id}`)} data-testid={`row-enquiry-${e.kind}-${e.id}`} className={`rounded-lg border p-3 text-left ${sel === `${e.kind}-${e.id}` ? 'border-[#315f43] bg-[#e9eddf]' : 'border-[#e0e3d8] bg-[#fbfaf6] hover:bg-[#f0f1e8]'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-bold text-[#20352c]">{e.name}</span><UnreadBadge n={e.unreadCount} label="new"/><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TONE[e.status]}`}>{e.status}</span></div><div className="mt-0.5 truncate text-[12px] text-[#52665a]">{e.subject}</div><div className="mt-0.5 text-[11px] text-[#7a877c]">{e.kind} / {e.reference} / {fmt(e.createdAt)}</div></button>) : <div className="rounded-lg border border-dashed border-[#cdd6c4] p-6 text-center text-[13px] text-[#68766b]" data-testid="status-no-enquiries">No enquiries match.</div>}
        </div>
      </div>
      <div>{current ? <Detail key={`${current.kind}-${current.id}`} e={current}/> : <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-[#cdd6c4] bg-[#f0f1e8] p-8 text-center"><div><Inbox className="mx-auto text-[#718c5d]"/><p className="mt-3 text-sm text-[#68766b]">Select an enquiry to read every field and update it.</p></div></div>}</div>
    </div>
  </div>;
}

export function AdminEnquiriesPage() {
  return <StaffGate path="/admin/enquiries">{() => <Enquiries/>}</StaffGate>;
}
