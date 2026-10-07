import { Search } from 'lucide-react';
import { type Filters, emptyFilters } from '@/lib/discovery';

type Props = { value: Filters; onChange: (f: Filters) => void; categories: string[]; kind: 'food' | 'recipe'; placeholder: string };
const num = (v: string) => (v ? Number(v) : null);

export function DiscoveryFilters({ value, onChange, categories, kind, placeholder }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const dirty = JSON.stringify(value) !== JSON.stringify(emptyFilters);
  return (
    <div className="mt-8 grid gap-4 rounded-[20px] border border-[#e0e3d8] bg-[#efefe6] p-4" data-testid="panel-filters">
      <label className="relative block">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#718073]" />
        <input value={value.search} onChange={(e) => set({ search: e.target.value })} placeholder={placeholder} aria-label={`Search ${kind}s`} data-testid={`input-${kind}-search`} className="field pl-11" />
      </label>
      <div className="mobile-scroll flex gap-2 overflow-x-auto pb-1">
        {['All', ...categories].map((item) => (
          <button key={item} type="button" onClick={() => set({ category: item })} data-testid={`button-category-${item.replaceAll(' ', '-').toLowerCase()}`} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${value.category === item ? 'bg-[#315f43] text-white' : 'border border-[#d7ddce] bg-[#fbfaf6] text-[#617064]'}`}>{item}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="field-label">Max calories
          <select className="field" value={value.maxCalories ?? ''} onChange={(e) => set({ maxCalories: num(e.target.value) })} data-testid={`select-${kind}-max-calories`}>
            <option value="">Any</option><option value="200">200 kcal</option><option value="250">250 kcal</option><option value="300">300 kcal</option><option value="400">400 kcal</option><option value="500">500 kcal</option>
          </select></label>
        <label className="field-label">Min protein
          <select className="field" value={value.minProtein ?? ''} onChange={(e) => set({ minProtein: num(e.target.value) })} data-testid={`select-${kind}-min-protein`}>
            <option value="">Any</option><option value="10">10 g</option><option value="20">20 g</option><option value="30">30 g</option>
          </select></label>
        <label className="field-label">Diet
          <select className="field" value={value.diet} onChange={(e) => set({ diet: e.target.value as Filters['diet'] })} data-testid={`select-${kind}-diet`}>
            <option value="any">All</option><option value="veg">Vegetarian</option><option value="vegan">Vegan</option><option value="nonveg">Non-vegetarian</option>
          </select></label>
        <label className="field-label">Budget
          <select className="field" value={value.maxBudget ?? ''} onChange={(e) => set({ maxBudget: num(e.target.value) })} data-testid={`select-${kind}-budget`}>
            <option value="">Any</option><option value="100">Up to ₹100</option><option value="150">Up to ₹150</option><option value="200">Up to ₹200</option><option value="300">Up to ₹300</option>
          </select></label>
        <label className="field-label col-span-2 md:col-span-1">Prep time
          <select className="field" value={value.maxPrep ?? ''} onChange={(e) => set({ maxPrep: num(e.target.value) })} data-testid={`select-${kind}-prep`}>
            <option value="">Any</option><option value="10">10 min or less</option><option value="15">15 min or less</option><option value="20">20 min or less</option><option value="30">30 min or less</option>
          </select></label>
      </div>
      {dirty && <button type="button" onClick={() => onChange(emptyFilters)} className="btn-secondary justify-self-start" data-testid={`button-reset-${kind}-filters`}>Reset filters</button>}
    </div>
  );
}
