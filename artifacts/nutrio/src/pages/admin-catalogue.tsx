import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Check, EyeOff, Plus, Search, X } from 'lucide-react';
import { getGetStaffCatalogueQueryKey, useCreateStaffListing, useGetStaffCatalogue, useUpdateStaffListing } from '@workspace/api-client-react';
import type { Food, Gym, Listing, ListingInput, Recipe } from '@workspace/api-client-react';
import { StaffGate, errText } from '@/pages/admin';
import { youtubeVideoId } from '@/lib/youtube';
import { RecipeVideo } from '@/components/recipe-video';

type Kind = 'food' | 'recipe' | 'gym';
type Draft = { isNew: boolean; kind: Kind; key: string; available: boolean; operatorSupplied: boolean; verified: boolean; verificationNote: string; videoLink?: string; food?: Food; recipe?: Recipe; gym?: Gym };

const blankFood = (): Food => ({ slug: '', name: '', description: '', category: '', priceInRupees: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, portion: '', prepMinutes: 0, ingredients: [], allergens: [], tags: [], imageUrl: '', vegetarian: true, bestFor: [], demonstration: false });
const blankRecipe = (): Recipe => ({ slug: '', name: '', description: '', category: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, prepMinutes: 0, difficulty: 'Easy', costInRupees: 0, vegetarian: true, tags: [], imageUrl: '', ingredients: [], steps: [], demonstration: false });
const blankGym = (): Gym => ({ id: '', name: '', locality: '', city: 'Hyderabad', address: '', distanceKm: 0, openingHours: '', categories: [], demonstration: false });
const newDraft = (kind: Kind): Draft => ({ isNew: true, kind, key: '', available: kind !== 'gym', operatorSupplied: true, verified: false, verificationNote: '', food: kind === 'food' ? blankFood() : undefined, recipe: kind === 'recipe' ? blankRecipe() : undefined, gym: kind === 'gym' ? blankGym() : undefined });
const fromListing = (l: Listing): Draft => ({ isNew: false, kind: l.kind, key: l.key, available: l.available, operatorSupplied: l.operatorSupplied, verified: l.verified, verificationNote: l.verificationNote, videoLink: l.recipe?.youtubeVideoId ? `https://www.youtube.com/watch?v=${l.recipe.youtubeVideoId}` : '', food: l.food, recipe: l.recipe, gym: l.gym });
const nameOf = (l: Listing) => l.food?.name ?? l.recipe?.name ?? l.gym?.name ?? l.key;
const KEY_RE = /^[a-z0-9-]{1,100}$/;

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field-label ${wide ? 'sm:col-span-2' : ''}`}>{label}{children}{hint && <span className="text-[11px] font-normal text-[#7a877c]">{hint}</span>}</label>;
}
function Txt({ label, value, onChange, hint, wide, id }: { label: string; value: string; onChange: (v: string) => void; hint?: string; wide?: boolean; id: string }) {
  return <Field label={label} hint={hint} wide={wide}><input className="field !py-2.5" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`input-${id}`}/></Field>;
}
function Num({ label, value, onChange, id, unit }: { label: string; value: number; onChange: (v: number) => void; id: string; unit?: string }) {
  return <Field label={unit ? `${label} (${unit})` : label}><input type="number" step="any" min="0" className="field !py-2.5" value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} data-testid={`input-${id}`}/></Field>;
}
function Lines({ label, value, onChange, hint, id }: { label: string; value: string[]; onChange: (v: string[]) => void; hint: string; id: string }) {
  const [raw, setRaw] = useState(value.join('\n'));
  return <Field label={label} hint={hint} wide><textarea className="field min-h-[96px] !py-2.5" value={raw} onChange={(e) => { setRaw(e.target.value); onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)); }} data-testid={`input-${id}`}/></Field>;
}
function Veg({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Field label="Diet"><select className="field field-select !py-2.5" value={value ? 'v' : 'n'} onChange={(e) => onChange(e.target.value === 'v')} data-testid="select-vegetarian"><option value="v">Vegetarian</option><option value="n">Contains meat, fish or egg</option></select></Field>;
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="border-t border-[#e0e3d8] pt-4"><legend className="pr-3 text-[11px] font-bold uppercase tracking-[.13em] text-[#79924c]">{title}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div></fieldset>;
}

function FoodFields({ f, set }: { f: Food; set: (f: Food) => void }) {
  const u = <K extends keyof Food>(k: K) => (v: Food[K]) => set({ ...f, [k]: v });
  return <>
    <Group title="Content"><Txt id="food-name" label="Name" value={f.name} onChange={u('name')}/><Txt id="food-category" label="Category" value={f.category} onChange={u('category')}/><Field label="Description" wide><textarea className="field min-h-[80px] !py-2.5" value={f.description} onChange={(e) => set({ ...f, description: e.target.value })} data-testid="input-food-description"/></Field><Txt id="food-portion" label="Portion" value={f.portion} onChange={u('portion')} hint="For example 1 bowl, about 350 g"/><Txt id="food-image" label="Image URL" value={f.imageUrl} onChange={u('imageUrl')}/><Veg value={f.vegetarian} onChange={u('vegetarian')}/><Num id="food-prep" label="Prep time" unit="min" value={f.prepMinutes} onChange={u('prepMinutes')}/></Group>
    <Group title="Price and nutrition (estimates)"><Num id="food-price" label="Price" unit="rupees" value={f.priceInRupees} onChange={u('priceInRupees')}/><Num id="food-cal" label="Energy" unit="kcal" value={f.calories} onChange={u('calories')}/><Num id="food-protein" label="Protein" unit="g" value={f.proteinG} onChange={u('proteinG')}/><Num id="food-carbs" label="Carbohydrate" unit="g" value={f.carbsG} onChange={u('carbsG')}/><Num id="food-fat" label="Fat" unit="g" value={f.fatG} onChange={u('fatG')}/><Num id="food-fiber" label="Fibre" unit="g" value={f.fiberG} onChange={u('fiberG')}/></Group>
    <Group title="Lists"><Lines id="food-ingredients" label="Ingredients" hint="One per line" value={f.ingredients} onChange={u('ingredients')}/><Lines id="food-allergens" label="Allergens" hint="One per line, for example peanuts, dairy" value={f.allergens} onChange={u('allergens')}/><Lines id="food-tags" label="Tags" hint="One per line" value={f.tags} onChange={u('tags')}/><Lines id="food-bestfor" label="Best for" hint="One per line, for example muscle, energy" value={f.bestFor} onChange={u('bestFor')}/></Group>
  </>;
}

function RecipeFields({ r, set }: { r: Recipe; set: (r: Recipe) => void }) {
  const u = <K extends keyof Recipe>(k: K) => (v: Recipe[K]) => set({ ...r, [k]: v });
  const setIng = (i: number, p: Partial<Recipe['ingredients'][number]>) => set({ ...r, ingredients: r.ingredients.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return <>
    <Group title="Content"><Txt id="recipe-name" label="Name" value={r.name} onChange={u('name')}/><Txt id="recipe-category" label="Category" value={r.category} onChange={u('category')}/><Field label="Description" wide><textarea className="field min-h-[80px] !py-2.5" value={r.description} onChange={(e) => set({ ...r, description: e.target.value })} data-testid="input-recipe-description"/></Field><Txt id="recipe-difficulty" label="Difficulty" value={r.difficulty} onChange={u('difficulty')} hint="Easy, Medium or Hard"/><Txt id="recipe-image" label="Image URL" value={r.imageUrl} onChange={u('imageUrl')}/><Veg value={r.vegetarian} onChange={u('vegetarian')}/><Num id="recipe-prep" label="Prep time" unit="min" value={r.prepMinutes} onChange={u('prepMinutes')}/></Group>
    <Group title="Cost and nutrition (estimates)"><Num id="recipe-cost" label="Approx. cost" unit="rupees" value={r.costInRupees} onChange={u('costInRupees')}/><Num id="recipe-cal" label="Energy" unit="kcal" value={r.calories} onChange={u('calories')}/><Num id="recipe-protein" label="Protein" unit="g" value={r.proteinG} onChange={u('proteinG')}/><Num id="recipe-carbs" label="Carbohydrate" unit="g" value={r.carbsG} onChange={u('carbsG')}/><Num id="recipe-fat" label="Fat" unit="g" value={r.fatG} onChange={u('fatG')}/><Num id="recipe-fiber" label="Fibre" unit="g" value={r.fiberG} onChange={u('fiberG')}/></Group>
    <fieldset className="border-t border-[#e0e3d8] pt-4"><legend className="pr-3 text-[11px] font-bold uppercase tracking-[.13em] text-[#79924c]">Ingredients with quantities</legend>
      <div className="mt-3 grid gap-2">{r.ingredients.map((ing, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input className="field !py-2" placeholder="Ingredient" aria-label={`Ingredient ${i + 1} name`} value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} data-testid={`input-ingredient-name-${i}`}/><input className="field !py-2" placeholder="Quantity" aria-label={`Ingredient ${i + 1} quantity`} value={ing.quantity} onChange={(e) => setIng(i, { quantity: e.target.value })} data-testid={`input-ingredient-qty-${i}`}/><button type="button" aria-label={`Remove ingredient ${i + 1}`} className="grid w-9 place-items-center rounded-lg border border-[#d5dccd] text-[#8a3f2d] hover:bg-[#f6e1d8]" onClick={() => set({ ...r, ingredients: r.ingredients.filter((_, j) => j !== i) })} data-testid={`button-remove-ingredient-${i}`}><X size={14}/></button></div>)}
        <button type="button" className="btn-secondary w-fit !px-3.5 !py-2 !text-[12px]" onClick={() => set({ ...r, ingredients: [...r.ingredients, { name: '', quantity: '' }] })} data-testid="button-add-ingredient"><Plus size={13}/>Add ingredient</button></div></fieldset>
    <Group title="Method and tags"><Lines id="recipe-steps" label="Steps" hint="One step per line, in order" value={r.steps} onChange={u('steps')}/><Lines id="recipe-tags" label="Tags" hint="One per line" value={r.tags} onChange={u('tags')}/></Group>
  </>;
}

function GymFields({ g, set }: { g: Gym; set: (g: Gym) => void }) {
  const u = <K extends keyof Gym>(k: K) => (v: Gym[K]) => set({ ...g, [k]: v });
  return <Group title="Gym details"><Txt id="gym-name" label="Name" value={g.name} onChange={u('name')}/><Txt id="gym-locality" label="Locality" value={g.locality} onChange={u('locality')}/><Txt id="gym-city" label="City" value={g.city} onChange={u('city')}/><Txt id="gym-hours" label="Opening hours" value={g.openingHours} onChange={u('openingHours')}/><Txt id="gym-address" label="Address" wide value={g.address} onChange={u('address')}/><Num id="gym-distance" label="Distance" unit="km" value={g.distanceKm} onChange={u('distanceKm')}/><Lines id="gym-categories" label="Categories" hint="One per line, for example Strength, Yoga" value={g.categories} onChange={u('categories')}/></Group>;
}

function Editor({ initial, onSaved, onClose }: { initial: Draft; onSaved: (key: string, kind: Kind) => void; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateStaffListing();
  const update = useUpdateStaffListing();
  const [d, setD] = useState<Draft>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [ok, setOk] = useState('');
  const pending = create.isPending || update.isPending;
  const err = create.error ?? update.error;
   const gymLocked = d.kind === 'gym' && d.operatorSupplied && !d.verified;
  const noteOk = d.verificationNote.trim().length >= 10;

  const submit = () => {
    const p: string[] = [];
    const key = d.key.trim();
    if (d.isNew && !KEY_RE.test(key)) p.push('Key must be 1 to 100 characters: lowercase letters, numbers and hyphens.');
    const name = d.food?.name ?? d.recipe?.name ?? d.gym?.name ?? '';
    if (!name.trim()) p.push('Name is required.');
    if (d.recipe && d.videoLink?.trim() && !youtubeVideoId(d.videoLink)) p.push('Enter a valid HTTPS YouTube video link (watch, share, Shorts or live video), or leave it blank.');
    if (d.isNew && !d.operatorSupplied) p.push('New listings must have details supplied by the operator.');
    if (d.verified && !d.operatorSupplied) p.push('Verification needs "Details supplied by the operator" to be ticked.');
    if (d.verified && !noteOk) p.push('Verification needs a meaningful note: say who confirmed what, and how (at least 10 characters).');
    setProblems(p); setOk('');
    if (p.length) return;
    const k = d.isNew ? key : d.key;
    const body: ListingInput = { kind: d.kind, key: k, available: gymLocked ? false : d.available, operatorSupplied: d.operatorSupplied, verified: d.verified, verificationNote: d.verificationNote.trim() };
    if (d.food) body.food = { ...d.food, slug: k };
    if (d.recipe) body.recipe = { ...d.recipe, slug: k, youtubeVideoId: d.videoLink?.trim() ? youtubeVideoId(d.videoLink)! : '' };
    if (d.gym) body.gym = { ...d.gym, id: k };
    const done = (l: Listing) => {
      qc.setQueryData<Listing[]>(getGetStaffCatalogueQueryKey(), (old) => (old ? (old.some((x) => x.kind === l.kind && x.key === l.key) ? old.map((x) => (x.kind === l.kind && x.key === l.key ? l : x)) : [...old, l]) : old));
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/') });
      setOk(`${nameOf(l)} saved${l.available ? ' and visible to members.' : ' and hidden from public browse.'}`);
      setD(fromListing(l));
      onSaved(l.key, l.kind);
    };
    if (d.isNew) create.mutate({ data: body }, { onSuccess: done }); else update.mutate({ kind: d.kind, key: k, data: body }, { onSuccess: done });
  };

  return <div className="rounded-2xl border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-6" data-testid="panel-editor">
    <div className="flex items-start justify-between gap-3"><div><div className="eyebrow">{d.isNew ? `New ${d.kind}` : `Editing ${d.kind}`}</div><h2 className="font-display mt-1 text-xl font-bold tracking-[-.04em] text-[#20352c]">{(d.food?.name || d.recipe?.name || d.gym?.name) || 'Untitled listing'}</h2></div><button type="button" onClick={onClose} aria-label="Close editor" className="grid h-9 w-9 place-items-center rounded-full border border-[#d5dccd]" data-testid="button-close-editor"><X size={16}/></button></div>
    <div className="mt-5 grid gap-5">
      <Group title="Identifier"><Field label="Key" hint={d.isNew ? 'Lowercase letters, numbers, hyphens. Cannot be changed after saving.' : 'Fixed. Saved plans and enquiries refer to it.'}><input className="field !py-2.5 font-mono" value={d.key} readOnly={!d.isNew} disabled={!d.isNew} onChange={(e) => setD({ ...d, key: e.target.value })} data-testid="input-key"/></Field></Group>
      {d.food && <FoodFields f={d.food} set={(food) => setD({ ...d, food })}/>}
      {d.recipe && <RecipeFields r={d.recipe} set={(recipe) => setD({ ...d, recipe })}/>}
      {d.recipe && <Group title="Preparation video (optional)">
        <Txt id="recipe-youtube" label="YouTube video link" value={d.videoLink ?? ''} onChange={(videoLink) => setD({ ...d, videoLink })} wide hint="Paste a YouTube watch, share or Shorts link. The video must allow embedding. Clear this field and save to remove the video."/>
        {d.videoLink?.trim() && !youtubeVideoId(d.videoLink) && <p className="text-sm text-[#7d3a28] sm:col-span-2" role="alert">This is not a valid HTTPS YouTube video link.</p>}
        {d.videoLink && youtubeVideoId(d.videoLink) && <div className="sm:col-span-2"><RecipeVideo videoId={youtubeVideoId(d.videoLink)!} name={d.recipe.name || 'Recipe'}/></div>}
      </Group>}
      {d.gym && <GymFields g={d.gym} set={(gym) => setD({ ...d, gym })}/>}
      <fieldset className="border-t border-[#e0e3d8] pt-4"><legend className="pr-3 text-[11px] font-bold uppercase tracking-[.13em] text-[#79924c]">Availability and verification</legend>
        <div className="mt-3 grid gap-3">
          <label className="flex items-start gap-3 rounded-lg bg-[#f0f1e8] p-3 text-[13px]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#315f43]" checked={gymLocked ? false : d.available} disabled={gymLocked} onChange={(e) => setD({ ...d, available: e.target.checked })} data-testid="checkbox-available"/><span><b className="text-[#20352c]">Available to members</b><br/><span className="text-[#68766b]">{gymLocked ? 'New gyms stay hidden until verified.' : 'Turn off to hide from public browse. Listings are never deleted, so saved plans and enquiries keep working.'}</span></span></label>
          <label className="flex items-start gap-3 rounded-lg bg-[#f0f1e8] p-3 text-[13px]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#315f43]" checked={d.operatorSupplied} onChange={(e) => setD({ ...d, operatorSupplied: e.target.checked, verified: e.target.checked ? d.verified : false })} data-testid="checkbox-operator"/><span><b className="text-[#20352c]">Details supplied by the operator</b><br/><span className="text-[#68766b]">The kitchen, author or gym gave us this information directly.</span></span></label>
          <label className="flex items-start gap-3 rounded-lg bg-[#dce8c8]/60 p-3 text-[13px]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#315f43]" checked={d.verified} disabled={!d.operatorSupplied} onChange={(e) => setD({ ...d, verified: e.target.checked })} data-testid="checkbox-verified"/><span><b className="text-[#20352c]">Verified by staff</b><br/><span className="text-[#68766b]">Removes the demonstration marker from public pages. Needs operator-supplied details and a note.</span></span></label>
          <Field label={`Verification note (${d.verificationNote.length}/1000)`} hint="Who confirmed it, when and how."><textarea className="field min-h-[80px] !py-2.5" maxLength={1000} value={d.verificationNote} onChange={(e) => setD({ ...d, verificationNote: e.target.value })} data-testid="input-verification-note"/></Field>
        </div></fieldset>
    </div>
    {(problems.length > 0 || err) && <div className="mt-5 rounded-lg bg-[#f6e1d8] p-3 text-[13px] text-[#7d3a28]" role="alert" data-testid="status-editor-error">{problems.map((x) => <p key={x}>{x}</p>)}{err && !problems.length && <p>{errText(err)}</p>}</div>}
    {ok && <p className="mt-5 flex items-center gap-2 rounded-lg bg-[#dce8c8] p-3 text-[13px] font-semibold text-[#315f43]" role="status" data-testid="status-editor-saved"><Check size={15}/>{ok}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={submit} disabled={pending} data-testid="button-save-listing">{pending ? 'Saving' : d.isNew ? 'Create listing' : 'Save changes'}</button><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
  </div>;
}

function Catalogue() {
  const q = useGetStaffCatalogue({ query: { queryKey: getGetStaffCatalogueQueryKey(), refetchInterval: 45000, refetchOnWindowFocus: true } });
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [flag, setFlag] = useState('all');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [nonce, setNonce] = useState(0);
  const edRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => (q.data ?? []).filter((l) => (kind === 'all' || l.kind === kind) && (flag === 'all' || (flag === 'hidden' && !l.available) || (flag === 'unverified' && !l.verified) || (flag === 'verified' && l.verified)) && `${nameOf(l)} ${l.key}`.toLowerCase().includes(text.toLowerCase())).sort((a, b) => a.kind.localeCompare(b.kind) || nameOf(a).localeCompare(nameOf(b))), [q.data, kind, flag, text]);
  const open = (d: Draft) => { setEditing(d); setNonce((n) => n + 1); setTimeout(() => edRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const onSaved = (key: string, k: Kind) => setEditing((cur) => (cur && cur.isNew ? { ...cur, isNew: false, key, kind: k } : cur));
  const counts = { total: q.data?.length ?? 0, hidden: (q.data ?? []).filter((l) => !l.available).length, verified: (q.data ?? []).filter((l) => l.verified).length };
  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-[#68766b]" data-testid="text-catalogue-counts">{counts.total} listings / {counts.verified} verified / {counts.hidden} hidden</p>
      <div className="flex flex-wrap gap-2">{(['food', 'recipe', 'gym'] as Kind[]).map((k) => <button key={k} type="button" className="btn-secondary !px-3.5 !py-2 !text-[12px]" onClick={() => open(newDraft(k))} data-testid={`button-new-${k}`}><Plus size={13}/>New {k}</button>)}</div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
      <div>
        <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718073]"/><input className="field !py-2.5 pl-10" placeholder="Search name or key" value={text} onChange={(e) => setText(e.target.value)} data-testid="input-catalogue-search"/></div>
        <div className="mt-2 flex flex-wrap gap-1.5">{(['all', 'food', 'recipe', 'gym'] as const).map((k) => <button key={k} type="button" className="chip !px-3 !py-1.5" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`chip-kind-${k}`}>{k}</button>)}<span className="mx-1 w-px bg-[#d5dccd]"/>{['all', 'verified', 'unverified', 'hidden'].map((k) => <button key={k} type="button" className="chip !px-3 !py-1.5" aria-pressed={flag === k} onClick={() => setFlag(k)} data-testid={`chip-flag-${k}`}>{k}</button>)}</div>
        <div className="mt-3 grid max-h-[720px] gap-1.5 overflow-y-auto">
          {q.isLoading ? [1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-14 rounded-lg"/>) : q.isError ? <div className="rounded-lg bg-[#f6e1d8] p-4 text-[13px] text-[#7d3a28]" role="alert" data-testid="status-catalogue-error">{errText(q.error)}<button type="button" className="btn-secondary mt-3" onClick={() => q.refetch()} data-testid="button-retry-catalogue">Try again</button></div> : list.length ? list.map((l) => {
            const active = editing && !editing.isNew && editing.kind === l.kind && editing.key === l.key;
            return <button key={`${l.kind}-${l.key}`} type="button" onClick={() => open(fromListing(l))} data-testid={`row-listing-${l.kind}-${l.key}`} className={`rounded-lg border p-3 text-left ${active ? 'border-[#315f43] bg-[#e9eddf]' : 'border-[#e0e3d8] bg-[#fbfaf6] hover:bg-[#f0f1e8]'} ${l.available ? '' : 'opacity-75'}`}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-bold text-[#20352c]">{nameOf(l)}</span><span className="shrink-0 text-[10px] font-bold uppercase tracking-[.1em] text-[#7a877c]">{l.kind}</span></div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className="font-mono text-[11px] text-[#7a877c]">{l.key}</span>
                {l.verified ? <span className="flex items-center gap-1 rounded bg-[#dce8c8] px-1.5 py-0.5 text-[10px] font-bold text-[#315f43]"><BadgeCheck size={11}/>Verified</span> : <span className="rounded bg-[#f6e8c6] px-1.5 py-0.5 text-[10px] font-bold text-[#7b5b17]">Unverified</span>}
                {!l.available && <span className="flex items-center gap-1 rounded bg-[#e4e6dc] px-1.5 py-0.5 text-[10px] font-bold text-[#5b665e]"><EyeOff size={11}/>Hidden</span>}</div>
            </button>;
          }) : <div className="rounded-lg border border-dashed border-[#cdd6c4] p-6 text-center text-[13px] text-[#68766b]" data-testid="status-no-listings">No listings match.</div>}
        </div>
      </div>
      <div ref={edRef} className="scroll-mt-24">{editing ? <Editor key={`${nonce}`} initial={editing} onSaved={onSaved} onClose={() => setEditing(null)}/> : <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-[#cdd6c4] bg-[#f0f1e8] p-8 text-center"><p className="max-w-xs text-sm leading-6 text-[#68766b]">Pick a listing to edit every field, or start a new food, recipe or gym.</p></div>}</div>
    </div>
  </div>;
}

export function AdminCataloguePage() {
  return <StaffGate path="/admin/catalogue">{() => <Catalogue/>}</StaffGate>;
}
