import { type FormEvent, useState } from 'react';
import { ArrowRight, Leaf } from 'lucide-react';

const DISCLAIMER = 'Nutrition values and recommendations are estimates for general informational purposes and are not medical advice. Consult a qualified healthcare professional or registered dietitian for medical or condition-specific nutrition needs.';
type Goal = 'loss' | 'maintain' | 'muscle';
type Result = { kcal: number; protein: number; carbs: number; fat: number };

export function calculate(sex: 'female' | 'male', age: number, h: number, w: number, activity: number, goal: Goal): Result {
  const bmr = 10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161);
  const adjust = goal === 'loss' ? -400 : goal === 'muscle' ? 250 : 0;
  const kcal = Math.max(0, Math.round((bmr * activity + adjust) / 10) * 10);
  const perKg = goal === 'loss' ? 1.6 : goal === 'muscle' ? 1.8 : 1.2;
  const protein = Math.max(0, Math.round(perKg * w));
  const fat = Math.max(0, Math.round((kcal * 0.3) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

export function CalculatorPage() {
  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [age, setAge] = useState('25');
  const [height, setHeight] = useState('165');
  const [weight, setWeight] = useState('62');
  const [activity, setActivity] = useState('1.4');
  const [goal, setGoal] = useState<Goal>('maintain');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const a = Number(age), h = Number(height), w = Number(weight);
    if (!Number.isFinite(a) || a < 18 || a > 100) { setError('This calculator is for adults aged 18 to 100.'); setResult(null); return; }
    if (!(h >= 120 && h <= 230) || !(w >= 30 && w <= 250)) { setError('Please check your height (120 to 230 cm) and weight (30 to 250 kg).'); setResult(null); return; }
    setError('');
    setResult(calculate(sex, a, h, w, Number(activity), goal));
  }
  const goals: [Goal, string][] = [['loss', 'Weight loss'], ['maintain', 'Maintain weight'], ['muscle', 'Gain muscle']];
  return (
    <div className="page-wrap py-11 md:py-16"><div className="mx-auto max-w-[980px]">
      <div className="max-w-2xl"><div className="eyebrow">A useful starting point</div>
        <h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Your day, <span className="serif font-medium italic text-[#668052]">in balance.</span></h1>
        <p className="mt-4 text-sm leading-7 text-[#68766b]">Get a rough daily estimate of calories, protein, carbs and fat. It is a guide, not a rulebook.</p></div>
      <div className="mt-9 grid overflow-hidden rounded-[26px] border border-[#e0e3d8] bg-[#fbfaf6] md:grid-cols-[1fr_.9fr]">
        <form onSubmit={submit} className="grid gap-5 p-6 sm:p-9" noValidate>
          <fieldset><legend className="field-label mb-2">Formula (Mifflin-St Jeor)</legend>
            <div className="grid grid-cols-2 gap-2">{([['female', 'Female (-161)'], ['male', 'Male (+5)']] as const).map(([v, l]) => <button type="button" key={v} onClick={() => setSex(v)} aria-pressed={sex === v} data-testid={`button-sex-${v}`} className={`rounded-xl border px-2 py-3 text-xs font-bold ${sex === v ? 'border-[#557b4c] bg-[#e6edda] text-[#315f43]' : 'border-[#e0e3d8] text-[#738075]'}`}>{l}</button>)}</div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Age (18+)<input required type="number" min="18" max="100" value={age} onChange={(e) => setAge(e.target.value)} data-testid="input-calc-age" className="field" /></label>
            <label className="field-label">Weight (kg)<input required type="number" min="30" max="250" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} data-testid="input-calc-weight" className="field" /></label>
            <label className="field-label">Height (cm)<input required type="number" min="120" max="230" value={height} onChange={(e) => setHeight(e.target.value)} data-testid="input-calc-height" className="field" /></label>
            <label className="field-label">Typical movement<select value={activity} onChange={(e) => setActivity(e.target.value)} data-testid="select-calc-activity" className="field"><option value="1.2">Mostly sitting</option><option value="1.4">A little movement most days</option><option value="1.6">Active most days</option><option value="1.8">Very active routine</option></select></label>
          </div>
          <fieldset><legend className="field-label mb-2">Your goal</legend>
            <div className="grid grid-cols-3 gap-2">{goals.map(([v, l]) => <button type="button" key={v} onClick={() => setGoal(v)} aria-pressed={goal === v} data-testid={`button-goal-${v}`} className={`rounded-xl border px-2 py-3 text-[11px] font-bold ${goal === v ? 'border-[#557b4c] bg-[#e6edda] text-[#315f43]' : 'border-[#e0e3d8] text-[#738075]'}`}>{l}</button>)}</div></fieldset>
          {error && <p role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]" data-testid="text-calc-error">{error}</p>}
          <button className="btn-primary w-full" type="submit" data-testid="button-calculate">Get my estimate <ArrowRight size={16} /></button>
        </form>
        <div className="flex flex-col justify-center bg-[#315f43] p-7 text-[#f7f5eb] sm:p-9">
          <div className="eyebrow !text-[#c7dc9e]">Your daily estimate</div>
          {result ? <>
            <div className="font-display mt-4 text-6xl font-extrabold tracking-[-.07em]" data-testid="text-calorie-result">{result.kcal.toLocaleString()}<span className="ml-2 text-xl font-semibold tracking-normal">kcal</span></div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4 text-center">
              <div><dd className="font-display text-2xl font-bold" data-testid="text-protein-result">{result.protein}g</dd><dt className="text-[11px] text-[#d1ddcf]">Protein</dt></div>
              <div><dd className="font-display text-2xl font-bold" data-testid="text-carbs-result">{result.carbs}g</dd><dt className="text-[11px] text-[#d1ddcf]">Carbs</dt></div>
              <div><dd className="font-display text-2xl font-bold" data-testid="text-fat-result">{result.fat}g</dd><dt className="text-[11px] text-[#d1ddcf]">Fat</dt></div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-[#d1ddcf]">Protein is set by body weight, fat is about 30% of energy, and carbs fill the rest.</p></> :
            <><div className="serif mt-4 text-4xl italic leading-tight">A helpful number,<br />not the whole story.</div><p className="mt-4 text-sm leading-6 text-[#d1ddcf]">Fill in your details to see an estimate.</p></>}
          <div className="mt-6 border-t border-white/20 pt-4 text-[11px] leading-5 text-[#d1ddcf]" data-testid="text-disclaimer">{DISCLAIMER}</div>
        </div>
      </div>
      <div className="mt-6 flex gap-3 rounded-2xl bg-[#e9eddf] p-5"><Leaf size={19} className="mt-0.5 shrink-0 text-[#557b4c]" />
        <p className="text-xs leading-5 text-[#657367]" data-testid="text-calc-limits">This calculator is for healthy adults aged 18 and over. It is not suitable if you are pregnant or breastfeeding, under 18, or managing a medical condition such as diabetes, kidney disease or an eating disorder. In those cases, please speak with a qualified healthcare professional or registered dietitian.</p></div>
    </div></div>
  );
}
