import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Leaf, Send, Trash2 } from 'lucide-react';
import { getGetAssistantHistoryQueryKey, useDeleteAssistantHistory, useSendAssistantMessage } from '@workspace/api-client-react';
import type { AssistantTurn } from '@workspace/api-client-react';
import { useAssistantHistory, useMemberSession } from '@/hooks/use-member';
import { useSeo } from '@/lib/seo';

type FormValues = { text: string; useProfile: boolean };
const errStatus = (e: unknown) => (e as { status?: number })?.status;

export function AssistantPage() {
  useSeo('Ask Nutrio, AI food assistant', 'Private AI chat for everyday food questions. Signed-in members get up to 20 AI attempts a day. General guidance only, not medical advice.');
  const { ready, signedIn, userId } = useMemberSession();
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const qc = useQueryClient();
  const form = useForm<FormValues>({ defaultValues: { text: '', useProfile: false } });
  const [sendError, setSendError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState('');
  const draft = useRef<{ text: string; useProfile: boolean; id: string }>({ text: "", useProfile: false, id: crypto.randomUUID() });
  const send = useSendAssistantMessage();
  const clear = useDeleteAssistantHistory();
  const [pendingLocal, setPendingLocal] = useState(false);
  const history = useAssistantHistory(pendingLocal);
  const turns: AssistantTurn[] = history.data?.turns ?? [];
  const hasPending = turns.some((t) => t.status === 'pending');
  const remaining = history.data?.dailyRemaining;
  const busy = send.isPending || pendingLocal || hasPending || clear.isPending;
  const exhausted = remaining === 0;
  const refresh = () => qc.invalidateQueries({ queryKey: getGetAssistantHistoryQueryKey() });
  useEffect(() => {
    form.reset({ text: '', useProfile: false });
    draft.current = { text: '', useProfile: false, id: crypto.randomUUID() };
    setSendError(''); setClearError(''); setConfirmClear(false); setPendingLocal(false);
    send.reset(); clear.reset();
  }, [userId, form.reset, send.reset, clear.reset]);

  const submit = form.handleSubmit(async (v) => {
    const text = v.text.trim();
    if (!text || busy || exhausted) return;
    const owner = userId;
    if (draft.current.text !== text || draft.current.useProfile !== v.useProfile) draft.current = { text, useProfile: v.useProfile, id: crypto.randomUUID() };
    setSendError(''); setPendingLocal(true);
    try {
      await send.mutateAsync({ data: { text, requestId: draft.current.id, useProfile: v.useProfile } });
      if (currentOwner.current !== owner) return;
      form.reset({ text: '', useProfile: v.useProfile });
      draft.current = { text: '', useProfile: v.useProfile, id: crypto.randomUUID() };
    } catch (e) {
      if (currentOwner.current !== owner) return;
      const s = errStatus(e);
      setSendError(s === 429 ? 'You have used today\'s AI attempts, or the shared daily limit has been reached. Your draft is kept; try again tomorrow.' : s === 409 ? 'The request conflicts with an existing question. Wait for any pending reply, or edit the question to start a new request.' : 'We could not confirm the reply. Your draft is kept. Retrying will not duplicate a saved reply; a new AI attempt uses your daily allowance.');
    } finally { if (currentOwner.current === owner) { setPendingLocal(false); await refresh(); } }
  });
  const doClear = async () => {
    const owner = userId;
    setClearError('');
    try { await clear.mutateAsync(); if (currentOwner.current === owner) setConfirmClear(false); } catch (e) { if (currentOwner.current === owner) setClearError(errStatus(e) === 409 ? 'A question is still being answered. Try again when it finishes.' : 'Could not clear your chat. Please try again.'); }
    if (currentOwner.current === owner) await refresh();
  };
  const reuse = (t: AssistantTurn) => { form.setValue('text', t.userText); form.setValue('useProfile', t.useProfile); draft.current = { text: t.userText.trim(), useProfile: t.useProfile, id: t.requestId }; setSendError(''); };

  return <div className="page-wrap py-11 md:py-16">
    <div className="max-w-2xl"><div className="eyebrow">Ask Nutrio</div>
      <h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Food questions, <span className="serif font-medium italic text-[#668052]">answered kindly.</span></h1>
      <p className="mt-4 text-sm leading-7 text-[#68766b]">A private AI chat for everyday eating: ideas, swaps, how to read a label. General guidance only, never medical advice. It does not write meal plans or place orders. Use the <Link href="/member/plans" className="font-bold text-[#315f43]">meal planner</Link> and <Link href="/food" className="font-bold text-[#315f43]">food menu</Link> for those.</p></div>
    <div className="mt-6 max-w-3xl rounded-2xl border border-[#e0bf7d] bg-[#f6e8c6] p-4 text-xs leading-6 text-[#6c4f14]" data-testid="text-assistant-privacy">Privacy: your questions and recent conversation are sent to an AI provider to produce a reply. Please do not share sensitive identifiers such as phone numbers, addresses, or medical record details. Optionally include your saved nutrition goals; this is off unless you tick the box.</div>
    {!ready ? <div className="skeleton mt-8 h-64 max-w-3xl rounded-[24px]"/> : !signedIn ? <div className="mt-8 max-w-3xl rounded-[26px] bg-[#315f43] p-7 text-[#f7f5eb] md:p-10" data-testid="card-assistant-guest"><Leaf size={22}/><h2 className="font-display mt-3 text-3xl font-bold tracking-[-.05em]">Sign in to start a private chat</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#d1ddcf]">Your conversation is saved to your account only. Members can ask up to 20 questions a day.</p><Link href="/sign-in" className="btn-primary mt-5 !border-[#d9e6bb] !bg-[#d9e6bb] !text-[#20352c]" data-testid="link-assistant-sign-in">Sign in <ArrowRight size={15}/></Link></div> :
    <div className="mt-8 max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#68766b]"><span data-testid="text-assistant-remaining">{remaining == null ? 'Checking your daily allowance...' : `${remaining} of 20 AI attempts left today`}</span>
        {turns.length > 0 && !confirmClear && <button type="button" disabled={busy} className="inline-flex items-center gap-1 font-bold text-[#9b5142] disabled:opacity-50" onClick={() => setConfirmClear(true)} data-testid="button-clear-chat"><Trash2 size={14}/> Clear chat</button>}</div>
      {confirmClear && <div role="alertdialog" className="mb-4 rounded-2xl border border-[#e3c4bb] bg-[#f6e6e1] p-4 text-xs leading-6 text-[#7d4034]">This deletes the chat saved by Nutrio for your account. It does not delete anything the AI provider may have received, and it does not give back today's AI allowance.{clearError && <div className="mt-1 font-bold">{clearError}</div>}<div className="mt-3 flex gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={doClear} data-testid="button-confirm-clear">{clear.isPending ? 'Deleting...' : 'Delete saved chat'}</button><button type="button" className="btn-secondary" disabled={clear.isPending} onClick={() => { setConfirmClear(false); setClearError(''); }}>Keep it</button></div></div>}
      <div className="grid gap-4 rounded-[24px] border border-[#e0e3d8] bg-[#f3f2e9] p-4 md:p-6" aria-live="polite" data-testid="list-assistant-turns">
        {history.isLoading ? <><div className="skeleton h-16 rounded-2xl"/><div className="skeleton h-24 rounded-2xl"/></> : history.isError && !history.data ? <div role="alert" className="text-center text-sm text-[#9b5142]">We could not load your chat. <button type="button" className="font-bold underline" onClick={() => history.refetch()}>Try again</button></div> : !turns.length ? <p className="py-8 text-center text-sm text-[#68766b]">Nothing here yet. Try: "What is a filling vegetarian breakfast under 400 kcal?"</p> :
        turns.map((t) => <div key={t.id} className="grid gap-2" data-testid={`turn-${t.id}`}>
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[#315f43] px-4 py-3 text-sm leading-6 text-[#f7f5eb]">{t.userText}</div>
          <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-[#e0e3d8] bg-[#fbfaf6] px-4 py-3 text-sm leading-6 text-[#20352c]">
            {t.status === 'pending' ? <span className="text-[#68766b]">Thinking it over...</span> : t.status === 'failed' ? <><span className="text-[#9b5142]">{t.error || 'This question could not be answered.'}</span><button type="button" disabled={busy || exhausted} className="mt-2 block text-xs font-bold text-[#315f43] underline disabled:opacity-50" onClick={() => reuse(t)}>Put this question back in the box to retry</button></> : t.reply}</div></div>)}
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3" noValidate>
        <label className="field-label">Your question<textarea className="field min-h-[96px] resize-y" maxLength={2000} rows={3} placeholder="Ask about everyday food..." disabled={busy || exhausted} {...form.register('text', { required: true })} data-testid="input-assistant-text"/></label>
        <label className="flex items-start gap-2 text-xs leading-5 text-[#42584a]"><input type="checkbox" className="mt-1" disabled={busy} {...form.register('useProfile')} data-testid="checkbox-use-profile"/>Include my saved nutrition goals (goal, diet preference, daily calories and protein) with this question</label>
        {sendError && <p role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]" data-testid="text-assistant-error">{sendError}</p>}
        {exhausted && <p role="status" className="rounded-xl bg-[#f6e8c6] p-3 text-xs text-[#7b5b17]">You have used all 20 AI attempts for today. They reset at midnight India time.</p>}
        <p className="text-[11px] leading-5 text-[#7a877c]">Your latest 50 questions are shown. New attempts, including retries of failed AI calls, use the daily allowance. Saved replies are not generated again when retried.</p>
        <button type="submit" disabled={busy || exhausted} className="btn-primary w-full disabled:opacity-60 sm:w-auto sm:justify-self-start" data-testid="button-assistant-send"><Send size={15}/> {busy ? 'Waiting for reply...' : 'Send'}</button>
      </form>
    </div>}
  </div>;
}
