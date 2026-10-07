import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Check } from 'lucide-react';
import { useCreateNewsletterSignup } from '@workspace/api-client-react';

type Values = { email: string; consent: boolean; website: string };

export function NewsletterSignup() {
  const mutation = useCreateNewsletterSignup();
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { control, handleSubmit, register, formState: { errors } } = useForm<Values>({ defaultValues: { email: '', consent: false, website: '' } });
  const submit = handleSubmit(async (v) => {
    setFailed(false); setDone(null);
    try {
      const res = await mutation.mutateAsync({ data: { email: v.email.trim(), consent: true, website: v.website } });
      setDone(res.message);
    } catch { setFailed(true); }
  });
  return <form onSubmit={submit} noValidate className="grid gap-4" data-testid="form-newsletter">
    <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
      <label>Website<input type="text" tabIndex={-1} autoComplete="off" {...register('website')}/></label>
    </div>
    <div>
      <label htmlFor="newsletter-email" className="text-[12px] font-bold text-[#315f43]">Your email address</label>
      <Controller control={control} name="email" rules={{ validate: (x) => /^\S+@\S+\.\S+$/.test(x.trim()) || 'Enter a valid email address.' }} render={({ field }) =>
        <input id="newsletter-email" type="email" autoComplete="email" placeholder="you@example.com" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} disabled={mutation.isPending} data-testid="input-newsletter-email" className="mt-1.5 h-12 w-full rounded-xl border border-[#d5dccd] bg-[#fbfaf6] px-4 text-sm text-[#20352c] outline-none focus:border-[#315f43]"/>}/>
      {errors.email && <p className="mt-1.5 text-xs text-[#a03b2c]" role="alert">{errors.email.message}</p>}
    </div>
    <div>
      <Controller control={control} name="consent" rules={{ validate: (x) => x || 'Please tick the box to continue.' }} render={({ field }) =>
        <label className="flex items-start gap-3 text-[13px] leading-5 text-[#55655a]">
          <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} disabled={mutation.isPending} data-testid="checkbox-newsletter-consent" className="mt-0.5 h-4 w-4 accent-[#315f43]"/>
          <span>I agree that Nutrio may save my email address and send me a one-time welcome newsletter with meal tips and article highlights.</span>
        </label>}/>
      {errors.consent && <p className="mt-1.5 text-xs text-[#a03b2c]" role="alert">{errors.consent.message}</p>}
    </div>
    <button type="submit" disabled={mutation.isPending} className="btn-primary justify-self-start disabled:opacity-60" data-testid="button-newsletter-submit">{mutation.isPending ? 'Signing up...' : failed ? 'Try again' : 'Send my welcome newsletter'}</button>
    {failed && <p className="rounded-xl bg-[#f6e3de] p-3 text-sm text-[#8a3326]" role="alert" data-testid="text-newsletter-error">We could not save your signup just now. Your email is still here, so you can try again.</p>}
    {done && <p className="flex items-start gap-2 rounded-xl bg-[#dce8c8] p-3 text-sm text-[#2a4433]" role="status" data-testid="text-newsletter-success"><Check size={16} className="mt-0.5 shrink-0"/>{done}</p>}
    <p className="text-[11px] leading-5 text-[#7a877c]">One welcome email per new subscriber; no recurring campaign is enabled. Delivery may take a little time. Check your inbox and spam folder, and only submit your own email address.</p>
  </form>;
}
