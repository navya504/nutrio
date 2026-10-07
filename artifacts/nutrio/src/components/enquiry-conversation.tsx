import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import {
  getGetMemberEnquiriesQueryKey, getGetMemberEnquiryConversationQueryKey, getGetStaffEnquiriesQueryKey, getGetStaffEnquiryConversationQueryKey,
  useGetMemberEnquiryConversation, useGetStaffEnquiryConversation, useMarkMemberEnquiryRead, useMarkStaffEnquiryRead,
  useSendMemberEnquiryMessage, useSendStaffEnquiryMessage,
} from '@workspace/api-client-react';
import type { EnquiryConversation as Conv } from '@workspace/api-client-react';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';

type Kind = 'order' | 'partnership' | 'contact';
const schema = z.object({ body: z.string().refine((v) => v.trim().length >= 1, 'Write a message first.').refine((v) => v.trim().length <= 3000, 'Keep it to 3000 characters or fewer.') });
const fmt = (s: string) => { const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const useVisible = () => {
  const [v, setV] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => { const f = () => setV(document.visibilityState === 'visible'); document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []);
  return v;
};

export function EnquiryConversation({ role, kind, id }: { role: 'member' | 'staff'; kind: Kind; id: number }) {
  const qc = useQueryClient();
  const isMember = role === 'member';
  const memberKey = getGetMemberEnquiryConversationQueryKey(kind, id);
  const staffKey = getGetStaffEnquiryConversationQueryKey(kind, id);
  const convKey = isMember ? memberKey : staffKey;
  const opts = { refetchInterval: 10000, refetchOnWindowFocus: true };
  const mq = useGetMemberEnquiryConversation(kind, id, { query: { ...opts, enabled: isMember, queryKey: memberKey } });
  const sq = useGetStaffEnquiryConversation(kind, id, { query: { ...opts, enabled: !isMember, queryKey: staffKey } });
  const q = isMember ? mq : sq;
  const sendM = useSendMemberEnquiryMessage();
  const sendS = useSendStaffEnquiryMessage();
  const readM = useMarkMemberEnquiryRead();
  const readS = useMarkStaffEnquiryRead();
  const send = isMember ? sendM : sendS;
  const visible = useVisible();
  const data: Conv | undefined = q.data;
  const listKey = isMember ? getGetMemberEnquiriesQueryKey() : getGetStaffEnquiriesQueryKey();

  // Mark read once per highest displayed message, only while the document is visible.
  const marked = useRef(0);
  const attempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tick, setTick] = useState(0);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  const markRef = useRef({ m: readM.mutate, s: readS.mutate });
  markRef.current = { m: readM.mutate, s: readS.mutate };
  const shownId = data && data.messages.length ? Math.max(...data.messages.map((m) => m.id)) : 0;
  const unread = data?.unreadCount ?? 0;
  useEffect(() => {
    if (!visible || !data || shownId < 1 || unread < 1 || marked.current >= shownId) return;
    marked.current = shownId;
    const done = () => {
      attempts.current = 0; setReadFailed(false);
      qc.setQueryData<Conv>(convKey, (o) => (o ? { ...o, unreadCount: o.latestMessageId > shownId ? o.unreadCount : 0 } : o));
      qc.invalidateQueries({ queryKey: listKey });
    };
    const fail = () => {
      marked.current = 0;
      attempts.current += 1;
      if (attempts.current > 3) { setReadFailed(true); return; }
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => { retryTimer.current = null; setTick((t) => t + 1); }, 4000 * attempts.current);
    };
    const args = { kind, id, data: { lastSeenMessageId: shownId } };
    if (isMember) markRef.current.m(args, { onSuccess: done, onError: fail }); else markRef.current.s(args, { onSuccess: done, onError: fail });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shownId, unread, !!data, tick]);

  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { body: '' } });
  const draft = useRef<{ body: string; clientId: string } | null>(null);
  const submit = form.handleSubmit((v) => {
    if (send.isPending) return;
    const body = v.body.trim();
    if (!draft.current || draft.current.body !== body) draft.current = { body, clientId: uuid() };
    const clientMessageId = draft.current.clientId;
    send.mutate({ kind, id, data: { body, clientMessageId } }, {
      onSuccess: () => {
        draft.current = null;
        form.reset({ body: '' });
        qc.invalidateQueries({ queryKey: convKey });
        qc.invalidateQueries({ queryKey: listKey });
      },
    });
  });

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [shownId]);

  const box = 'mt-4 rounded-xl border border-[#e0e3d8] bg-[#f6f6ef] p-4';
  if (q.isLoading) return <div className={box} aria-busy="true"><div className="skeleton h-14 rounded-lg"/></div>;
  if (q.isError || !data) return <div className="mt-4 rounded-lg bg-[#f6e1d8] p-4 text-[13px] text-[#7d3a28]" role="alert">We could not load this conversation.<button type="button" className="btn-secondary ml-3" onClick={() => q.refetch()} data-testid={`button-retry-conversation-${kind}-${id}`}>Try again</button></div>;
  const retryRead = () => { attempts.current = 0; setReadFailed(false); setTick((t) => t + 1); };
  const mine = isMember ? 'member' : 'staff';
  const label = (r: string) => (r === mine ? 'You' : r === 'staff' ? 'Nutrio team' : 'Member');
  return <div className={box} data-testid={`panel-conversation-${kind}-${id}`}>
    <h3 className="text-[11px] font-bold uppercase tracking-[.12em] text-[#7a877c]">{isMember ? 'Conversation with the team' : 'Member-visible reply'}</h3>
    {readFailed && unread > 0 && <p className="mt-2 text-[12px] text-[#7d3a28]" role="status" data-testid="status-read-error">We could not save that you have read these messages. <button type="button" className="font-bold underline" onClick={retryRead} data-testid={`button-retry-read-${kind}-${id}`}>Try again</button></p>}
    {!data.messages.length ? <p className="mt-3 rounded-lg border border-dashed border-[#cdd6c4] p-4 text-center text-[13px] text-[#68766b]" data-testid={`status-no-messages-${kind}-${id}`}>{isMember ? 'No replies yet. Send a message below if you want to add something.' : 'No messages yet.'}</p> :
      <ol className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto" aria-live="polite">{data.messages.map((m) => <li key={m.id} className={`max-w-[88%] rounded-xl px-3.5 py-2.5 ${m.authorRole === mine ? 'justify-self-end bg-[#dce8c8]' : 'justify-self-start border border-[#e0e3d8] bg-[#fbfaf6]'}`} data-testid={`message-${m.id}`}>
        <div className="text-[11px] font-bold text-[#52665a]">{label(m.authorRole)} <span className="font-normal text-[#7a877c]">/ {fmt(m.createdAt)}</span></div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#20352c]">{m.body}</p></li>)}<div ref={endRef}/></ol>}
    {!data.memberCanReply && !isMember ? <p className="mt-3 rounded-lg bg-[#f6e8c6] p-3 text-[12px] leading-5 text-[#6c4f14]" data-testid="text-no-member-reply">This enquiry is not linked to a member account, so replies cannot be delivered here. Contact them using the email or phone shown above.</p> :
     !data.memberCanReply ? <p className="mt-3 text-[12px] text-[#7a877c]">Replies are not available for this enquiry.</p> :
      <Form {...form}><form onSubmit={submit} className="mt-3 grid gap-2" noValidate>
        <FormField control={form.control} name="body" render={({ field }) => <FormItem><FormControl><textarea {...field} className="field min-h-[84px]" disabled={send.isPending} aria-label={isMember ? 'Your message' : 'Reply to the member'} placeholder={isMember ? 'Write a message to the team' : 'Write a reply the member will see'} data-testid={`input-message-${kind}-${id}`}/></FormControl><div className="text-[11px] text-[#7a877c]">{field.value.trim().length}/3000</div><FormMessage/></FormItem>}/>
        {send.isError && <p className="rounded-lg bg-[#f6e1d8] p-3 text-[12px] text-[#7d3a28]" role="alert" data-testid="status-message-error">We could not confirm that the message was sent. Your text is kept, so you can try again.</p>}
        <div><button type="submit" className="btn-primary" disabled={send.isPending} data-testid={`button-send-message-${kind}-${id}`}><Send size={15}/> {send.isPending ? 'Sending' : send.isError ? 'Retry send' : 'Send message'}</button></div>
      </form></Form>}
  </div>;
}

export const UnreadBadge = ({ n, label = 'unread' }: { n: number; label?: string }) => n > 0 ? <span className="shrink-0 rounded-full bg-[#9b5142] px-2 py-0.5 text-[10px] font-bold text-[#f7f5eb]" data-testid="badge-unread">{n} {label}</span> : null;
