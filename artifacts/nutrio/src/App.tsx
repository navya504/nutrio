import { useRef, type FormEvent, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Redirect } from 'wouter';
import { FavButton } from '@/components/fav-button';
import { RecipeVideo } from '@/components/recipe-video';
import { useMemberSession } from '@/hooks/use-member';
import { clearPlanLeaveWarning, confirmPlanLeave, useGuardedLocation } from '@/hooks/use-plan-leave-warning';
import { clearOtherPlanDrafts } from '@/lib/plan-draft';
import { DISCLAIMER } from '@/lib/disclaimer';
import { ArticleCard, ArticleError, ArticleSkeleton, ArticlePage, ArticlesPage, NewsletterPage } from '@/pages/articles';
import { AssistantPage } from '@/pages/assistant';
import { ChallengesPage } from '@/pages/challenges';
import { NewsletterSignup } from '@/components/newsletter-signup';
import { MemberEnquiriesPage, MemberOverview, MemberPlansPage, MemberProfilePage, MemberSavedPage } from '@/pages/member';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Check, Clock3, Dumbbell, Leaf, MapPin,
  LogOut, Menu, Minus, Plus, Search, ShoppingBag, ShoppingCart, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import {
  useCreateContactMessage, useGetArticles, useCreateFoodOrder, useCreateGymPartnership, useGetFood,
  useGetFoods, useGetGyms, useGetRecipe, useGetRecipes,
  getGetFoodQueryKey, getGetRecipeQueryKey, getGetMemberEnquiriesQueryKey,
} from '@workspace/api-client-react';
import type { Food, Recipe } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminHome, StaffSignInPage } from '@/pages/admin';
import { AdminCataloguePage } from '@/pages/admin-catalogue';
import { AdminEnquiriesPage } from '@/pages/admin-enquiries';
import NotFound from '@/pages/not-found';
import { CalculatorPage } from '@/components/calculator';
import { DiscoveryFilters } from '@/components/discovery-filters';
import { GOALS, applyFilters, emptyFilters, matchesGoal, type Filters } from '@/lib/discovery';
import { ROUTE_SEO, useSeo } from '@/lib/seo';
import heroBowl from './assets/hero-bowl.jpg';

type CartState = { [slug: string]: { food: Food; quantity: number } };
type CartContextValue = { cart: CartState; add: (food: Food) => void; change: (slug: string, amount: number) => void; clear: () => void };
const CartContext = createContext<CartContextValue | null>(null);
const useCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('Cart context is unavailable');
  return value;
};
const queryClient = new QueryClient();
const rupees = (value: number) => `₹${value}`;
const CART_KEY = 'nutrio-cart-v1';
function loadCart(): CartState {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    const out: CartState = {};
    for (const [slug, entry] of Object.entries(parsed as Record<string, { food?: Food; quantity?: number }>)) {
      const q = Number(entry?.quantity);
      if (entry?.food && entry.food.slug === slug && typeof entry.food.priceInRupees === 'number' && Number.isInteger(q) && q >= 1 && q <= 20) out[slug] = { food: entry.food, quantity: q };
    }
    return out;
  } catch { return {}; }
}
function Disclaimer({ className = '' }: { className?: string }) {
  return <p className={`text-[11px] leading-5 text-[#7a877c] ${className}`} data-testid="text-disclaimer">{DISCLAIMER}</p>;
}

function ListingDetail({ kind }: { kind: 'food' | 'recipe' }) {
  const { slug = '' } = useParams<{ slug: string }>();
  const food = useGetFood(slug, { query: { enabled: kind === 'food', queryKey: getGetFoodQueryKey(slug) } });
  const recipe = useGetRecipe(slug, { query: { enabled: kind === 'recipe', queryKey: getGetRecipeQueryKey(slug) } });
  const entry = kind === 'food' ? food.data : recipe.data;
  return <>
    {entry && (entry.demonstration || entry.available === false) && <div className="page-wrap pt-6"><p className="rounded-xl bg-[#f6e8c6] p-4 text-sm text-[#7b5b17]" data-testid="text-listing-provenance">{entry.available === false ? 'Currently unavailable. Kept here for saved plans and past enquiries. ' : ''}{entry.demonstration ? 'Demonstration listing — these details have not been verified with the operator.' : ''}</p></div>}
    {kind === 'food' ? <FoodDetail/> : <RecipeDetail/>}
  </>;
}
function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const { cart } = useCart();
  const count = Object.values(cart).reduce((total, item) => total + item.quantity, 0);
  const { signedIn } = useMemberSession();
  const { signOut } = useClerk();
  const leaveAndSignOut = () => {
    if (!confirmPlanLeave()) return;
    clearPlanLeaveWarning();
    try { clearOtherPlanDrafts(null); } catch { /* Auth listener retries cleanup after sign-out. */ }
    void signOut({ redirectUrl: import.meta.env.BASE_URL || '/' });
  };
  const links = [
    ['/food', 'Food menu'], ['/recipes', 'Recipes'], ['/nutrition/calorie-calculator', 'Calorie check'], ['/gyms', 'Find a gym'], ['/articles', 'Articles'], ['/newsletter', 'Newsletter'], ['/assistant', 'Ask Nutrio'], ['/challenges', 'Challenges'],
    ...(signedIn ? [['/member', 'Your space'], ['/member/plans', 'Meal plans']] : []),
  ];
  return <div className="grain min-h-[100dvh]">
    <div className="bg-[#315f43] px-4 py-2 text-center text-[11px] font-semibold tracking-[.07em] text-[#f7f5eb]">
      GOOD FOOD, WITHOUT THE GUESSWORK <span className="mx-2 opacity-50">/</span> MADE FOR YOUR EVERYDAY
    </div>
    <header className="sticky top-0 z-20 border-b border-[#dfe2d6] bg-[#f6f4ec]/95 backdrop-blur-md">
      <div className="page-wrap flex h-[72px] items-center justify-between gap-2 sm:gap-5">
        <Link href="/" className="flex items-center gap-2.5 text-[#20352c] no-underline" data-testid="link-brand-home">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-9 w-9" data-testid="img-logo"/>
          <span className="flex flex-col">
            <span className="font-display text-[20px] font-extrabold leading-6 tracking-[-.07em]">nutrio<span className="text-[#79924c]">.</span></span>
            <span className="whitespace-nowrap text-[8px] font-semibold leading-3 tracking-[.02em] text-[#617166] sm:text-[10px]" data-testid="text-brand-tagline">Eat Smart. Live Better.</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-3 xl:flex" aria-label="Main navigation">
          {links.map(([href, label]) => <Link key={href} href={href} data-testid={`link-nav-${href.replaceAll('/', '-') || 'home'}`} className={`text-[13px] font-semibold no-underline ${location === href ? 'text-[#315f43]' : 'text-[#617166] hover:text-[#20352c]'}`}>{label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? <button type="button" onClick={leaveAndSignOut} data-testid="button-sign-out" className="flex h-10 items-center gap-2 rounded-full border border-[#d5dccd] px-3.5 text-[13px] font-bold text-[#315f43] hover:bg-[#edf0e6]"><LogOut size={16}/><span className="hidden sm:inline">Sign out</span></button> : <Link href="/sign-in" data-testid="link-sign-in" className="flex h-10 items-center rounded-full bg-[#315f43] px-4 text-[13px] font-bold text-[#f7f5eb] no-underline hover:bg-[#244a34]">Sign in</Link>}
          <Link href="/cart" data-testid="link-cart" className="relative flex h-10 items-center gap-2 rounded-full border border-[#d5dccd] px-3.5 text-[13px] font-bold text-[#315f43] no-underline hover:bg-[#edf0e6]">
            <ShoppingBag size={17}/><span className="hidden sm:inline">Your bag</span>
            {count > 0 && <span data-testid="status-cart-count" className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#315f43] px-1 text-[10px] text-white">{count}</span>}
          </Link>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} data-testid="button-mobile-menu" className="grid h-10 w-10 place-items-center rounded-full border border-[#d5dccd] text-[#315f43] xl:hidden">{menuOpen ? <X size={18}/> : <Menu size={18}/>}</button>
        </div>
      </div>
      {menuOpen && <nav className="grid gap-1 border-t border-[#dfe2d6] bg-[#f6f4ec] px-5 py-3 xl:hidden" aria-label="Mobile navigation">
        {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} data-testid={`link-mobile-${href.replaceAll('/', '-')}`} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#354c3d] no-underline hover:bg-[#e9eddf]">{label}</Link>)}
        {!signedIn && <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#354c3d] no-underline hover:bg-[#e9eddf]">Sign in</Link>}
        {signedIn && <Link href="/member/saved" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#354c3d] no-underline hover:bg-[#e9eddf]">Saved</Link>}
        <Link href="/partner" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#354c3d] no-underline hover:bg-[#e9eddf]">Partner with us</Link>
        <Link href="/contact" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#354c3d] no-underline hover:bg-[#e9eddf]">Contact</Link>
      </nav>}
    </header>
    <main>{children}</main>
    <footer className="mt-24 bg-[#20372d] text-[#f4f1e8]">
      <div className="page-wrap grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:py-16">
        <div><div className="font-display text-2xl font-extrabold tracking-[-.07em]">nutrio<span className="text-[#bed28d]">.</span></div><p className="mt-3 max-w-xs text-sm leading-6 text-[#c3cec0]">Eat Smart. Live Better.<br/>Everyday food choices, made a little easier.</p></div>
        <div><div className="eyebrow !text-[#b7cf86]">Explore</div><div className="mt-4 grid gap-3 text-sm text-[#e3e8dc]"><Link href="/food" className="no-underline hover:text-white">Food menu</Link><Link href="/recipes" className="no-underline hover:text-white">Recipes</Link><Link href="/nutrition/calorie-calculator" className="no-underline hover:text-white">Calorie check</Link><Link href="/gyms" className="no-underline hover:text-white">Gym partners</Link><Link href="/articles" className="no-underline hover:text-white">Articles</Link><Link href="/newsletter" className="no-underline hover:text-white">Newsletter</Link><Link href="/assistant" className="no-underline hover:text-white">Ask Nutrio</Link><Link href="/challenges" className="no-underline hover:text-white">Challenges</Link></div></div>
        <div><div className="eyebrow !text-[#b7cf86]">Say hello</div><div className="mt-4 grid gap-3 text-sm text-[#e3e8dc]"><Link href="/partner" className="no-underline hover:text-white">Partner with Nutrio</Link><Link href="/contact" className="no-underline hover:text-white">Contact us</Link><span>Made with care in India</span><Link href="/admin" className="text-[11px] text-[#8fa08f] no-underline hover:text-white" data-testid="link-staff">Staff</Link></div></div>
      </div>
      <div className="border-t border-white/10 py-4"><div className="page-wrap flex justify-between text-[11px] text-[#aab8aa]"><span>© 2026 Nutrio</span><span>Good choices, one meal at a time.</span></div></div>
    </footer>
  </div>;
}

function SectionTitle({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{eyebrow}</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em] text-[#20352c] sm:text-[40px]">{title}</h2>{copy && <p className="mt-2 max-w-xl text-sm leading-6 text-[#68766b]">{copy}</p>}</div>{action}</div>;
}

function LoadingGrid() {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="overflow-hidden rounded-[22px] border border-[#e2e4d9] bg-[#fbfaf6]"><div className="skeleton h-52"/><div className="grid gap-3 p-5"><div className="skeleton h-4 w-1/3 rounded"/><div className="skeleton h-6 w-3/4 rounded"/><div className="skeleton h-4 w-full rounded"/></div></div>)}</div>;
}

function QueryMessage({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return <div className="rounded-[20px] border border-[#e0e4d8] bg-[#f0f1e8] px-6 py-10 text-center" role="status"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#dce7cb] text-[#315f43]"><Leaf size={19}/></div><h3 className="mt-4 font-display text-xl font-bold text-[#263e30]">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#67776a]">{message}</p><button type="button" className="btn-secondary mt-5" onClick={retry} data-testid="button-retry">Try again</button></div>;
}

function FoodCard({ food, index = 0 }: { food: Food; index?: number }) {
  const { add } = useCart();
  return <article className="food-card overflow-hidden rounded-[22px] border border-[#e3e5db] bg-[#fbfaf6]" data-testid={`card-food-${food.slug}`} style={{ animationDelay: `${index * 60}ms` }}>
    <Link href={`/food/${food.slug}`} className="relative block h-[210px] overflow-hidden bg-[#e9eddf]" data-testid={`link-food-${food.slug}`}>
      <img src={food.imageUrl || heroBowl} alt={food.name} className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]" onError={(event) => { event.currentTarget.src = heroBowl; }}/>
      <span className="absolute left-4 top-4 rounded-full bg-[#f8f6ee]/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.11em] text-[#3e6247]">{food.category}</span>
      {food.demonstration && <span className="absolute bottom-3 left-4 rounded-full bg-[#f6e8c6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#7b5b17]" data-testid={`badge-demo-${food.slug}`}>Demonstration</span>}
      {food.vegetarian && <span className="absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full bg-[#f8f6ee]/90"><span className="h-2 w-2 rounded-full border border-[#4a7a4b] bg-[#4a7a4b]"/></span>}
    </Link>
    <div className="p-5">
      <div className="flex items-start justify-between gap-3"><Link href={`/food/${food.slug}`} className="font-display text-lg font-bold leading-tight tracking-[-.04em] text-[#20352c] no-underline hover:text-[#527b4e]">{food.name}</Link><span className="shrink-0 font-display text-[17px] font-bold text-[#315f43]">{rupees(food.priceInRupees)}</span></div>
      <p className="mt-2 line-clamp-2 min-h-[42px] text-[12px] leading-[1.7] text-[#68766b]">{food.description}</p>
      <div className="mt-4 flex items-center justify-between border-t border-[#e6e8df] pt-3"><div className="flex gap-3 text-[11px] text-[#667468]"><span>{food.calories} kcal</span><span>{food.proteinG}g protein</span></div><div className="flex items-center gap-2"><FavButton kind="food" slug={food.slug} name={food.name}/><button type="button" onClick={() => add(food)} aria-label={`Add ${food.name} to bag`} data-testid={`button-add-${food.slug}`} className="grid h-9 w-9 place-items-center rounded-full bg-[#e6edda] text-[#315f43] hover:bg-[#d5e2c1]"><Plus size={17}/></button></div></div>
    </div>
  </article>;
}

function RecipeCard({ recipe, index = 0 }: { recipe: Recipe; index?: number }) {
  return <div className="food-card group relative overflow-hidden rounded-[22px] border border-[#e3e5db] bg-[#fbfaf6]" data-testid={`card-recipe-${recipe.slug}`} style={{ animationDelay: `${index * 60}ms` }}>
    <Link href={`/recipes/${recipe.slug}`} className="block text-inherit no-underline">
      <div className="relative h-[205px] overflow-hidden bg-[#e9eddf]"><img src={recipe.imageUrl || heroBowl} alt={recipe.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.src = heroBowl; }}/><span className="absolute bottom-3 left-3 rounded-full bg-[#f8f6ee]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#476747]">{recipe.category}</span>{recipe.demonstration && <span className="absolute bottom-3 right-3 rounded-full bg-[#f6e8c6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#7b5b17]" data-testid={`badge-demo-${recipe.slug}`}>Demonstration</span>}</div>
      <div className="p-5"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#6c7c6d]"><Clock3 size={13}/>{recipe.prepMinutes} min <span className="text-[#c4c8bc]">/</span>{recipe.difficulty}</div><h3 className="font-display mt-3 text-xl font-bold tracking-[-.045em] text-[#20352c]">{recipe.name}</h3><p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#68766b]">{recipe.description}</p><div className="mt-4 flex justify-between border-t border-[#e6e8df] pt-3 text-[11px] text-[#68766b]"><span>{recipe.calories} kcal</span><span>{recipe.proteinG}g protein</span><span>About ₹{recipe.costInRupees}</span></div></div>
    </Link>
    <div className="absolute right-3 top-3"><FavButton kind="recipe" slug={recipe.slug} name={recipe.name}/></div>
  </div>;
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/member"/></Show><Show when="signed-out"><HomePage/></Show></>;
}

function HomePage() {
  const foods = useGetFoods();
  const recipes = useGetRecipes();
  const articles = useGetArticles();
  const [goal, setGoal] = useState('muscle');
  const activeGoal = GOALS.find((g) => g.id === goal) ?? GOALS[0];
  const goalFoods = (foods.data || []).filter((f) => matchesGoal(goal, f)).slice(0, 3);
  const goalRecipes = (recipes.data || []).filter((r) => matchesGoal(goal, r)).slice(0, 3);
  return <>
    <section className="page-wrap grid min-h-[560px] items-center gap-10 py-12 md:grid-cols-[.92fr_1.08fr] md:py-16">
      <div className="reveal relative z-[1]"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dce1d2] bg-[#fbfaf6] px-3.5 py-2 text-[11px] font-bold tracking-[.04em] text-[#55734d]"><Sparkles size={13}/> GOOD FOOD, WITHOUT THE GUESSWORK</div><h1 className="font-display max-w-[590px] text-[49px] font-extrabold leading-[1.02] tracking-[-.075em] text-[#20352c] sm:text-[64px] lg:text-[76px]">Eat Smart.<br/><span className="serif font-medium italic tracking-[-.05em] text-[#668052]">Live Better.</span></h1><p className="mt-6 max-w-[430px] text-[15px] leading-7 text-[#69776c]">Healthy food, personalized nutrition and simple choices — all in one place.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/food" className="btn-primary" data-testid="button-home-explore">Explore Healthy Food <ArrowRight size={16}/></Link><a href="#goals" className="btn-secondary" data-testid="button-home-goals">Choose My Goal <ArrowDownRight size={16}/></a></div></div>
      <div className="relative mx-auto w-full max-w-[580px] reveal" style={{ animationDelay: '120ms' }}><div className="absolute -left-4 top-8 h-[85%] w-[92%] rounded-[42%_58%_47%_53%/49%_40%_60%_51%] bg-[#dfe8ce] md:-left-8"/><div className="relative h-[380px] overflow-hidden rounded-[42%_58%_47%_53%/49%_40%_60%_51%] md:h-[480px]"><img src={heroBowl} alt="A colorful Indian high-protein bowl with paneer, millet and fresh greens" className="h-full w-full object-cover"/></div><div className="absolute -bottom-4 right-1 rounded-2xl border border-[#e6e6da] bg-[#fbfaf6] p-4 shadow-[0_10px_30px_rgba(37,57,43,.11)] sm:right-[-18px]"><div className="flex items-center gap-2 text-[11px] font-bold text-[#4b7150]"><Leaf size={14}/> 450 kcal · 28g PROTEIN</div><p className="mt-1 text-[11px] text-[#738075]">No Fry · Fresh Ingredients · Estimated</p></div></div>
    </section>

    <section id="goals" className="bg-[#e9eddf] py-12 md:py-16"><div className="page-wrap">
      <SectionTitle eyebrow="Start here" title="What are you working towards?" copy="Choose a goal and we will pick foods and recipes from the menu that suit it. Change your mind any time."/>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="Choose a goal">{GOALS.map((g) => <button key={g.id} role="tab" aria-selected={goal === g.id} onClick={() => setGoal(g.id)} data-testid={`button-goal-select-${g.id}`} className={`rounded-2xl border p-4 text-left ${goal === g.id ? 'border-[#315f43] bg-[#315f43] text-[#f7f5eb]' : 'border-[#d7ddce] bg-[#fbfaf6] text-[#20352c] hover:border-[#9db28f]'}`}><div className="font-display text-[15px] font-bold tracking-[-.03em]">{g.label}</div><div className={`mt-1 text-[11px] leading-4 ${goal === g.id ? 'text-[#cfdccb]' : 'text-[#748176]'}`}>{g.hint}</div></button>)}</div>
      <div className="mt-9 flex items-end justify-between gap-4"><h3 className="font-display text-2xl font-bold tracking-[-.05em] text-[#20352c]" data-testid="text-goal-title">Featured for: {activeGoal.label}</h3><Link href="/food" className="hidden items-center gap-2 text-sm font-bold text-[#315f43] no-underline sm:flex">See the full menu <ArrowRight size={16}/></Link></div>
      <div className="mt-5">{foods.isLoading ? <LoadingGrid/> : foods.isError ? <QueryMessage title="Menu is taking a breather" message="We could not load the food menu just now. Give it another try." retry={() => foods.refetch()}/> : goalFoods.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="list-goal-foods">{goalFoods.map((food, i) => <FoodCard key={food.slug} food={food} index={i}/>)}</div> : <div className="rounded-2xl bg-[#f6f4ec] p-7 text-center text-sm text-[#68766b]">Nothing matched this goal yet. Try another one, or browse the full menu.</div>}</div>
      <Disclaimer className="mt-5"/>
    </div></section>

    <section className="page-wrap py-16 md:py-24"><SectionTitle eyebrow="How Nutrio works" title="Three easy steps"/><div className="grid gap-4 md:grid-cols-3">{[['01', 'Choose your goal', 'Tell us what you are working towards, from energy to budget.'], ['02', 'Discover your food', 'See meals and recipes that fit, with clear nutrition and ingredients.'], ['03', 'Eat better', 'Send a pickup enquiry or cook it yourself. Your pace, your call.']].map(([n, t, b], i) => <div key={n} className={`rounded-[24px] p-6 ${i === 1 ? 'bg-[#315f43] text-[#f7f5eb]' : 'border border-[#e0e3d8] bg-[#f0f1e8]'}`}><div className={`eyebrow ${i === 1 ? '!text-[#d5e6b7]' : ''}`}>{n}</div><h3 className="font-display mt-5 text-2xl font-bold tracking-[-.05em]">{t}</h3><p className={`mt-3 text-sm leading-6 ${i === 1 ? 'text-[#d1ddcf]' : 'text-[#68766b]'}`}>{b}</p></div>)}</div></section>

    <section className="page-wrap"><div className="grid items-center gap-6 rounded-[28px] bg-[#20372d] p-7 text-[#f4f1e8] md:grid-cols-[1.2fr_.8fr] md:p-11"><div><div className="eyebrow !text-[#b7cf86]">Nutrition calculator</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em]">Find a rough daily energy estimate.</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#c3cec0]">Takes about 30 seconds and runs right in your browser.</p></div><div className="md:text-right"><Link href="/nutrition/calorie-calculator" className="btn-primary !bg-[#d9e6bb] !text-[#20352c] !border-[#d9e6bb]" data-testid="link-home-calculator">Open calculator <ArrowRight size={15}/></Link></div></div></section>

    <section className="mt-16 bg-[#f0eee4] py-14"><div className="page-wrap"><SectionTitle eyebrow="Popular recipes" title={`Cook something for: ${activeGoal.label}`} copy="Simple recipes with quantities and steps." action={<Link href="/recipes" className="btn-secondary hidden sm:inline-flex">Browse recipes <ArrowRight size={15}/></Link>}/>{recipes.isLoading ? <LoadingGrid/> : recipes.isError ? <QueryMessage title="Recipes are not ready yet" message="Please try the recipe shelf again in a moment." retry={() => recipes.refetch()}/> : goalRecipes.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="list-goal-recipes">{goalRecipes.map((recipe, i) => <RecipeCard key={recipe.slug} recipe={recipe} index={i}/>)}</div> : <p className="rounded-2xl bg-[#fbfaf6] p-6 text-center text-sm text-[#68766b]">No recipes match this goal yet. See all recipes instead.</p>}</div></section>

    <section className="page-wrap py-16"><div className="flex flex-col gap-4 rounded-[28px] border border-[#c5cfb9] bg-[#f3f2e9] p-7 md:flex-row md:items-center md:justify-between md:p-10"><div><div className="eyebrow">Live now</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em] text-[#20352c]">Ask Nutrio</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#68766b]">A private AI chat for everyday food questions. Sign in to use it, up to 20 questions a day. General guidance only, not medical advice, and it does not build plans or take orders.</p></div><Link href="/assistant" className="btn-primary" data-testid="button-ask-nutrio">Open the assistant <ArrowRight size={15}/></Link></div></section>

    <section className="page-wrap"><div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-[#dce8c8] p-7 md:flex-row md:items-center md:p-11"><div><div className="eyebrow">Gym discovery</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em] text-[#20352c]">Find partner gyms.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#5e715f]">Browse gym listings. Verified partners are marked; sample entries are labelled as demonstrations.</p></div><Link href="/gyms" className="btn-primary" data-testid="link-home-gyms">Browse gyms <MapPin size={15}/></Link></div></section>

    <section className="page-wrap py-16"><div className="grid items-center gap-6 rounded-[28px] border border-[#e0e3d8] bg-[#fbfaf6] p-7 md:grid-cols-[1fr_auto] md:p-10"><div><div className="eyebrow">Gym partnership</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em] text-[#20352c]">Run a gym? Let us talk.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#68766b]">Tell us about your space and what your members might enjoy.</p></div><Link href="/partner" className="btn-primary" data-testid="link-home-partner">Partner with Nutrio <ArrowRight size={15}/></Link></div></section>

    <section className="page-wrap pb-16"><SectionTitle eyebrow="Healthy living" title="Short reads" action={<Link href="/articles" className="btn-secondary" data-testid="link-all-articles">All articles <ArrowRight size={15}/></Link>}/>{articles.isLoading ? <ArticleSkeleton/> : articles.isError ? <ArticleError title="Articles did not load" message="Please try again in a moment." retry={() => articles.refetch()}/> : <div className="grid gap-4 md:grid-cols-3">{(articles.data || []).slice(0, 3).map((a) => <ArticleCard key={a.slug} article={a}/>)}</div>}</section>

    <section className="page-wrap"><div className="flex flex-col gap-4 rounded-[28px] bg-[#315f43] p-7 text-[#f7f5eb] md:flex-row md:items-center md:justify-between md:p-11"><div><div className="eyebrow !text-[#d5e6b7]">Live now</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em]">Challenges</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#d1ddcf]">Join a gentle 21-day habit challenge and tick off one small action a day. Community totals are anonymous; joining needs a free account.</p></div><Link href="/challenges" className="btn-primary !border-[#d9e6bb] !bg-[#d9e6bb] !text-[#20352c]" data-testid="link-home-challenges">See challenges <ArrowRight size={15}/></Link></div></section>

    <section className="page-wrap py-16"><div className="grid gap-6 rounded-[28px] border border-[#e0e3d8] bg-[#fbfaf6] p-7 md:grid-cols-2 md:p-10"><div><div className="eyebrow">Updates</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em] text-[#20352c]">Want to hear when new things land?</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#68766b]" data-testid="text-newsletter-status">Register your interest. We are only collecting interest for now.</p></div><NewsletterSignup/></div></section>
  </>;
}

function FoodCatalogue() {
  const query = useGetFoods();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const categories = useMemo(() => [...new Set((query.data || []).map((food) => food.category))], [query.data]);
  const foods = applyFilters(query.data || [], filters);
  return <div className="page-wrap py-11 md:py-16"><div className="max-w-2xl"><div className="eyebrow">The everyday menu</div><h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Eat well, <span className="serif font-medium italic text-[#668052]">your way.</span></h1><p className="mt-4 max-w-xl text-sm leading-7 text-[#68766b]">Thoughtful food with clear nutrition. Try searching "under 300 calories" or "high protein".</p></div>
    <DiscoveryFilters kind="food" value={filters} onChange={setFilters} categories={categories} placeholder="Try: high protein, under 300 calories"/>
    <p className="mt-5 text-xs text-[#7a877c]" data-testid="text-food-count">{query.data ? `${foods.length} of ${query.data.length} foods` : ''}</p>
    <div className="mt-3">{query.isLoading ? <LoadingGrid/> : query.isError ? <QueryMessage title="The menu didn't load" message="There was a hiccup fetching the food list. Please try again." retry={() => query.refetch()}/> : foods.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{foods.map((food, i) => <FoodCard key={food.slug} food={food} index={i}/>)}</div> : <div className="rounded-[22px] border border-dashed border-[#cdd6c4] bg-[#f0f1e8] px-6 py-12 text-center"><SlidersHorizontal className="mx-auto text-[#718c5d]"/><h3 className="font-display mt-4 text-xl font-bold text-[#304937]">Nothing on this plate yet</h3><p className="mt-2 text-sm text-[#6b796d]">Try loosening a filter or searching something else.</p><button className="btn-secondary mt-4" onClick={() => setFilters(emptyFilters)} data-testid="button-clear-filters">Clear filters</button></div>}</div>
    <Disclaimer className="mt-8"/>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-[22px] bg-[#e8eddc] p-6"><div><div className="eyebrow">Not sure where to start?</div><p className="font-display mt-1 text-xl font-bold tracking-[-.04em] text-[#2a4433]">A quick calorie check can help you find your balance.</p></div><Link href="/nutrition/calorie-calculator" className="btn-secondary">Try the calculator <ArrowRight size={15}/></Link></div>
  </div>;
}

function FoodDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = useGetFood(slug);
  useSeo(query.data?.name ?? 'Food', query.data?.description ?? 'Nutrio food detail with full nutrition, ingredients and allergens.');
  const { add } = useCart();
  if (query.isLoading) return <div className="page-wrap py-12"><div className="skeleton h-[360px] rounded-[26px]"/></div>;
  if (query.isError || !query.data) return <div className="page-wrap py-16"><QueryMessage title="We couldn't find that dish" message="It may have moved off the menu. Try the full food list instead." retry={() => query.refetch()}/><Link href="/food" className="btn-secondary mt-5"><ArrowLeft size={15}/> Back to food</Link></div>;
  const food = query.data;
  return <div className="page-wrap py-8 md:py-12"><Link href="/food" className="inline-flex items-center gap-2 text-sm font-bold text-[#58704e] no-underline"><ArrowLeft size={15}/> All food</Link><div className="mt-6 grid gap-9 md:grid-cols-[1.05fr_.95fr]"><div className="relative min-h-[330px] overflow-hidden rounded-[28px] bg-[#e6eadc] md:min-h-[520px]"><img src={food.imageUrl || heroBowl} alt={food.name} className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.src = heroBowl; }}/><span className="absolute left-5 top-5 rounded-full bg-[#fbfaf6]/90 px-4 py-2 text-[11px] font-bold uppercase tracking-[.1em] text-[#3f6448]">{food.category}</span></div><div className="flex flex-col justify-center py-2"><div className="eyebrow">{food.vegetarian ? 'Vegetarian · made fresh' : 'Made fresh · balanced'}</div><h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-.065em] text-[#20352c] sm:text-5xl">{food.name}</h1><p className="mt-4 text-[15px] leading-7 text-[#68766b]">{food.description}</p><div className="mt-6 flex flex-wrap gap-2">{food.tags.map((tag) => <span key={tag} className="rounded-full bg-[#e8eddc] px-3 py-1.5 text-[11px] font-semibold text-[#58704e]">{tag}</span>)}</div><div className="mt-7 grid grid-cols-4 divide-x divide-[#e0e3d8] rounded-2xl border border-[#e0e3d8] bg-[#f0f1e8] py-4">{[['Energy', `${food.calories}`, 'kcal'], ['Protein', `${food.proteinG}`, 'g'], ['Carbs', `${food.carbsG}`, 'g'], ['Fibre', `${food.fiberG}`, 'g']].map(([name, n, unit]) => <div key={name} className="px-2 text-center"><div className="font-display text-xl font-bold text-[#315f43]">{n}<small className="ml-0.5 text-[9px] font-medium">{unit}</small></div><div className="mt-1 text-[10px] text-[#738075]">{name}</div></div>)}</div><div className="mt-5 flex items-end justify-between border-b border-[#e0e3d8] pb-5"><div><div className="text-[11px] text-[#718073]">Portion · {food.portion}</div><div className="mt-1 flex items-center gap-2 text-[12px] text-[#718073]"><Clock3 size={14}/>{food.prepMinutes} min prep</div></div><span className="font-display text-3xl font-extrabold tracking-[-.05em] text-[#315f43]">{rupees(food.priceInRupees)}</span></div><div className="mt-5 flex flex-wrap gap-3"><FavButton kind="food" slug={food.slug} name={food.name} label/></div><button onClick={() => add(food)} disabled={food.available === false} className="btn-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50" data-testid={`button-detail-add-${food.slug}`}><ShoppingCart size={17}/> {food.available === false ? 'Currently unavailable' : 'Add to your bag'}</button><div className="mt-7 grid gap-5 sm:grid-cols-2"><div><div className="eyebrow">Ingredients</div><p className="mt-2 text-xs leading-6 text-[#68766b]">{food.ingredients.join(', ')}</p></div><div><div className="eyebrow">A note for you</div><p className="mt-2 text-xs leading-6 text-[#68766b]">Best for {food.bestFor.join(', ').toLowerCase()}. </p></div></div><div className="mt-5 rounded-2xl border border-[#e0e3d8] bg-[#f0f1e8] p-4" data-testid="text-food-details"><div className="eyebrow">Full nutrition per portion</div><dl className="mt-3 grid grid-cols-3 gap-3 text-xs text-[#536457] sm:grid-cols-5"><div><dt className="text-[10px] text-[#8a968c]">Calories</dt><dd className="font-bold">{food.calories} kcal</dd></div><div><dt className="text-[10px] text-[#8a968c]">Protein</dt><dd className="font-bold">{food.proteinG} g</dd></div><div><dt className="text-[10px] text-[#8a968c]">Carbs</dt><dd className="font-bold">{food.carbsG} g</dd></div><div><dt className="text-[10px] text-[#8a968c]">Fat</dt><dd className="font-bold">{food.fatG} g</dd></div><div><dt className="text-[10px] text-[#8a968c]">Fibre</dt><dd className="font-bold">{food.fiberG} g</dd></div></dl><p className="mt-3 text-xs text-[#536457]" data-testid="text-food-allergens"><span className="font-bold">Allergens:</span> {food.allergens.length ? food.allergens.join(', ') : 'None listed'}</p></div><Disclaimer className="mt-4"/></div></div></div>;
}

function RecipesPage() {
  const query = useGetRecipes();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const categories = useMemo(() => [...new Set((query.data || []).map((r) => r.category))], [query.data]);
  const recipes = applyFilters(query.data || [], filters);
  return <div className="page-wrap py-11 md:py-16"><div className="max-w-2xl"><div className="eyebrow">The home-cook edit</div><h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Recipes for <span className="serif font-medium italic text-[#668052]">real life.</span></h1><p className="mt-4 max-w-xl text-sm leading-7 text-[#68766b]">Weeknight-friendly, ingredient-smart ideas. Budget shows approximate cost per recipe.</p></div>
    <DiscoveryFilters kind="recipe" value={filters} onChange={setFilters} categories={categories} placeholder="Try: high protein, vegetarian, under 20 minutes"/>
    <div className="mt-8">{query.isLoading ? <LoadingGrid/> : query.isError ? <QueryMessage title="Recipe shelf unavailable" message="We couldn't load the recipes right now." retry={() => query.refetch()}/> : recipes.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recipes.map((recipe, i) => <RecipeCard key={recipe.slug} recipe={recipe} index={i}/>)}</div> : <div className="rounded-2xl bg-[#f0f1e8] p-10 text-center"><h3 className="font-display text-xl font-bold text-[#304937]">No recipes found</h3><p className="mt-2 text-sm text-[#6b796d]">Try loosening a filter.</p><button className="btn-secondary mt-4" onClick={() => setFilters(emptyFilters)} data-testid="button-clear-recipe-filters">Clear filters</button></div>}</div><Disclaimer className="mt-8"/></div>;
}

function RecipeDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = useGetRecipe(slug);
  useSeo(query.data?.name ?? 'Recipe', query.data?.description ?? 'Nutrio recipe with quantities, steps and nutrition.');
  if (query.isLoading) return <div className="page-wrap py-12"><div className="skeleton h-[380px] rounded-[26px]"/></div>;
  if (query.isError || !query.data) return <div className="page-wrap py-16"><QueryMessage title="Recipe not found" message="This recipe isn't available right now. Browse the recipe collection." retry={() => query.refetch()}/><Link href="/recipes" className="btn-secondary mt-5"><ArrowLeft size={15}/> All recipes</Link></div>;
  const recipe = query.data;
  return <div className="page-wrap py-8 md:py-12">
    <Link href="/recipes" className="inline-flex items-center gap-2 text-sm font-bold text-[#58704e] no-underline"><ArrowLeft size={15}/> All recipes</Link>
    <div className="mt-6 grid gap-9 md:grid-cols-[1fr_1fr]">
      <div className="relative min-h-[300px] overflow-hidden rounded-[28px] bg-[#e6eadc] md:min-h-[500px]"><img src={recipe.imageUrl || heroBowl} alt={recipe.name} className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.src = heroBowl; }}/></div>
      <div className="flex flex-col justify-center">
        <div className="eyebrow">{recipe.category} · {recipe.difficulty}</div>
        <h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-.065em] text-[#20352c] sm:text-5xl">{recipe.name}</h1>
        <div className="mt-4"><FavButton kind="recipe" slug={recipe.slug} name={recipe.name} label/></div>
        <p className="mt-4 text-sm leading-7 text-[#68766b]">{recipe.description}</p>
        <div className="mt-6 flex flex-wrap gap-2">{recipe.tags.map((tag) => <span key={tag} className="rounded-full bg-[#e8eddc] px-3 py-1.5 text-[11px] font-semibold text-[#58704e]">{tag}</span>)}</div>
        <div className="mt-6 grid grid-cols-4 divide-x divide-[#e0e3d8] rounded-2xl border border-[#e0e3d8] bg-[#f0f1e8] py-4">{[['Time', `${recipe.prepMinutes}m`], ['Energy', `${recipe.calories}`], ['Protein', `${recipe.proteinG}g`], ['Cost', `₹${recipe.costInRupees}`]].map(([label, value]) => <div key={label} className="text-center"><div className="font-display text-lg font-bold text-[#315f43]">{value}</div><div className="mt-1 text-[10px] text-[#738075]">{label}</div></div>)}</div>
        <div className="mt-7"><div className="eyebrow">What you'll need</div><ul className="mt-3 grid gap-2 sm:grid-cols-2">{recipe.ingredients.map((ingredient) => <li key={ingredient.name} className="flex justify-between border-b border-[#e5e7de] pb-2 text-xs text-[#536457]"><span>{ingredient.name}</span><span className="font-semibold">{ingredient.quantity}</span></li>)}</ul></div>
      </div>
    </div>
    <div className="mt-12 grid gap-8 md:grid-cols-[.55fr_1fr]">
      <div>
        <div className="eyebrow">The method</div><h2 className="font-display mt-2 text-3xl font-bold tracking-[-.055em] text-[#20352c]">Let's make it.</h2>
        <p className="mt-3 text-sm leading-6 text-[#68766b]">A few simple steps. Taste as you go, and make it yours.</p>
        <div className="mt-4 text-xs text-[#536457]">Per serving: {recipe.calories} kcal, {recipe.proteinG}g protein, {recipe.carbsG}g carbs, {recipe.fatG}g fat, {recipe.fiberG}g fibre.</div><Disclaimer className="mt-3"/>
      </div>
      <div>
        <RecipeVideo videoId={recipe.youtubeVideoId} name={recipe.name}/>
        <ol className={`${recipe.youtubeVideoId ? 'mt-6 ' : ''}grid gap-3`}>{recipe.steps.map((step, index) => <li key={`${index}-${step}`} className="flex gap-4 rounded-2xl border border-[#e2e5da] bg-[#fbfaf6] p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e4ebd7] font-display text-sm font-bold text-[#416444]">{String(index + 1).padStart(2, '0')}</span><span className="pt-1 text-sm leading-6 text-[#57685b]">{step}</span></li>)}</ol>
      </div>
    </div>
  </div>;
}

function GymsPage() {
  const [search, setSearch] = useState('');
  const query = useGetGyms(search ? { search } : undefined);
  return <div className="page-wrap py-11 md:py-16"><div className="grid gap-8 md:grid-cols-[1fr_350px] md:items-end"><div><div className="eyebrow">Move your way</div><h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-6xl">Good energy, <span className="serif font-medium italic text-[#668052]">near you.</span></h1><p className="mt-4 max-w-xl text-sm leading-7 text-[#68766b]">Search by city or neighbourhood. Search by locality. Verified partners are marked; sample entries are labelled as demonstrations and are not live availability.</p></div><label className="relative block"><MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#718073]"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hyderabad or Madhapur" aria-label="Search gyms by location" data-testid="input-gym-search" className="field pl-11"/></label></div><div className="mt-8">{query.isLoading ? <div className="grid gap-4">{[1,2,3].map((i) => <div key={i} className="skeleton h-32 rounded-2xl"/> )}</div> : query.isError ? <QueryMessage title="Gym listings are unavailable" message="Please try searching again in a little while." retry={() => query.refetch()}/> : query.data?.length ? <div className="grid gap-4 md:grid-cols-2">{query.data.map((gym) => <article key={gym.id} className="rounded-[22px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-6" data-testid={`card-gym-${gym.id}`}><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">{gym.locality}, {gym.city}</div><h2 className="font-display mt-2 text-xl font-bold tracking-[-.045em] text-[#20352c]">{gym.name}</h2></div>{gym.demonstration ? <div className="rounded-full bg-[#f6e8c6] px-3 py-1.5 text-[11px] font-bold text-[#7b5b17]" data-testid={`badge-gym-demo-${gym.id}`}>Demonstration / {gym.distanceKm} km illustrative</div> : <div className="rounded-full bg-[#dce8c8] px-3 py-1.5 text-[11px] font-bold text-[#315f43]" data-testid={`badge-gym-verified-${gym.id}`}>Verified partner</div>}</div><p className="mt-3 text-xs leading-5 text-[#68766b]">{gym.address}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7de] pt-4"><span className="flex items-center gap-1.5 text-xs text-[#68766b]"><Clock3 size={13}/>{gym.openingHours}</span><Link href="/food" className="text-xs font-bold text-[#315f43] underline underline-offset-2" data-testid={`link-gym-menu-${gym.id}`}>View Menu</Link><div className="flex flex-wrap gap-1.5">{gym.categories.map((category) => <span key={category} className="rounded-full bg-[#f0f1e8] px-2.5 py-1 text-[10px] font-semibold text-[#607064]">{category}</span>)}</div></div></article>)}</div> : <div className="rounded-[22px] border border-dashed border-[#cdd6c4] bg-[#f0f1e8] px-6 py-12 text-center"><Dumbbell className="mx-auto text-[#718c5d]"/><h3 className="font-display mt-4 text-xl font-bold text-[#304937]">No gyms in that search just yet</h3><p className="mt-2 text-sm text-[#6b796d]">Try another city or neighbourhood.</p>{search && <button className="btn-secondary mt-4" onClick={() => setSearch('')}>Show all gyms</button>}</div>}</div><div className="mt-12 flex flex-col items-start justify-between gap-5 rounded-[24px] bg-[#dce8c8] p-6 sm:flex-row sm:items-center sm:p-8"><div><div className="eyebrow">Run a gym?</div><h2 className="font-display mt-2 text-2xl font-bold tracking-[-.05em] text-[#20352c]">Let’s make better food part of the routine.</h2></div><Link href="/partner" className="btn-primary">Become a partner <ArrowRight size={15}/></Link></div></div>;
}

function FormSuccess({ title, body, reference }: { title: string; body: string; reference?: string }) {
  const { signedIn } = useMemberSession();
  return <div className="rounded-[24px] border border-[#d5dfc9] bg-[#eaf0df] p-7 text-center" role="status" data-testid="status-form-success"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#d3e2bf] text-[#315f43]"><Check size={22}/></div><h2 className="font-display mt-4 text-2xl font-bold tracking-[-.05em] text-[#284333]">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#607064]">{body}</p>{reference && <p className="mt-4 text-xs font-bold text-[#55734d]">Reference {reference}</p>}{signedIn && <Link href="/member/enquiries" className="btn-secondary mt-5" data-testid="link-success-member-enquiries">View in your enquiries <ArrowRight size={15}/></Link>}</div>;
}

function OrderPage() {
  const { cart, change, clear } = useCart();
  const qc = useQueryClient();
  const mutation = useCreateFoodOrder({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMemberEnquiriesQueryKey() }); } } });
  const items = Object.values(cart);
  const total = items.reduce((sum, item) => sum + item.food.priceInRupees * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (mutation.isSuccess) return <div className="page-wrap max-w-3xl py-16"><FormSuccess title="Your enquiry has been received." body={`Receipt status: ${mutation.data.status}. ${mutation.data.itemCount} item(s), estimated total ₹${mutation.data.totalInRupees}. This is an enquiry only, no payment was taken. Confirmation will be required from the Nutrio team before anything is prepared.`} reference={mutation.data.id}/><p className="mt-3 text-center text-xs text-[#7a877c]" data-testid="text-receipt-time">Submitted {new Date(mutation.data.submittedAt).toLocaleString()}</p><div className="mt-6 text-center"><Link href="/food" className="btn-secondary">Back to the menu <ArrowRight size={15}/></Link></div></div>;
  return <div className="page-wrap py-10 md:py-14"><Link href="/food" className="inline-flex items-center gap-2 text-sm font-bold text-[#58704e] no-underline"><ArrowLeft size={15}/> Keep browsing</Link><div className="mt-5"><div className="eyebrow">Pickup enquiry</div><h1 className="font-display mt-2 text-4xl font-extrabold tracking-[-.065em] text-[#20352c] sm:text-5xl">Your order enquiry.</h1><p className="mt-3 text-sm text-[#68766b]">This sends an enquiry, not a payment or a confirmed order. We will confirm with you.</p></div>
    {!items.length ? <div className="mt-9 rounded-[24px] border border-dashed border-[#ccd5c3] bg-[#f0f1e8] px-6 py-12 text-center"><ShoppingBag className="mx-auto text-[#718c5d]" size={25}/><h2 className="font-display mt-4 text-2xl font-bold text-[#304937]">Your bag is taking a little pause.</h2><p className="mt-2 text-sm text-[#6b796d]">Add a meal from the menu to get started.</p><Link href="/food" className="btn-primary mt-5">Explore the menu <ArrowRight size={15}/></Link></div> :
    <div className="mt-8 grid gap-7 lg:grid-cols-[.9fr_1.1fr]"><section className="h-fit rounded-[22px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold text-[#20352c]">In your bag <span className="text-sm font-medium text-[#819084]">({count})</span></h2><button type="button" onClick={clear} className="text-xs font-bold text-[#728073] underline underline-offset-2" data-testid="button-clear-cart">Clear bag</button></div><div className="mt-4 divide-y divide-[#e5e7de]">{items.map(({ food, quantity }) => <div key={food.slug} className="flex gap-3 py-4" data-testid={`row-cart-${food.slug}`}><img src={food.imageUrl || heroBowl} alt="" className="h-[74px] w-[74px] rounded-xl object-cover" onError={(event) => { event.currentTarget.src = heroBowl; }}/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><div><h3 className="font-display text-sm font-bold text-[#294333]">{food.name}</h3><p className="mt-1 text-[11px] text-[#7b887d]">{rupees(food.priceInRupees)} · {food.calories} kcal each</p></div><span className="text-sm font-bold text-[#315f43]">{rupees(food.priceInRupees * quantity)}</span></div><div className="mt-3 inline-flex items-center gap-3 rounded-full border border-[#e0e3d8] px-2 py-1"><button type="button" aria-label={`Remove one ${food.name}`} onClick={() => change(food.slug, -1)} data-testid={`button-decrease-${food.slug}`} className="grid h-6 w-6 place-items-center rounded-full text-[#55734d]"><Minus size={13}/></button><span className="min-w-3 text-center text-xs font-bold">{quantity}</span><button type="button" aria-label={`Add one ${food.name}`} onClick={() => change(food.slug, 1)} data-testid={`button-increase-${food.slug}`} className="grid h-6 w-6 place-items-center rounded-full text-[#55734d]"><Plus size={13}/></button></div></div></div>)}</div><div className="mt-3 flex justify-between border-t border-[#e0e3d8] pt-4"><span className="text-sm font-semibold text-[#526457]">Estimated total</span><span className="font-display text-xl font-bold text-[#315f43]" data-testid="text-cart-total">{rupees(total)}</span></div><p className="mt-2 text-[10px] leading-5 text-[#849086]">Final confirmation and pickup details will be shared by the Nutrio team.</p></section>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); mutation.mutate({ data: { customerName: String(form.get('customerName')), phone: String(form.get('phone')), email: String(form.get('email')) || undefined, pickupLocation: String(form.get('pickupLocation')), pickupTime: String(form.get('pickupTime')), note: String(form.get('note')) || undefined, items: items.map(({ food, quantity }) => ({ foodSlug: food.slug, quantity })) } }, { onSuccess: () => clear() }); }} className="grid gap-4 rounded-[22px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-6">
        <div className="mb-1"><div className="eyebrow">Pickup details</div><h2 className="font-display mt-1 text-xl font-bold text-[#20352c]">Where should we meet?</h2></div>
        <label className="field-label">Your name<input required minLength={2} name="customerName" placeholder="Name" data-testid="input-order-name" className="field"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Phone number<input required minLength={8} maxLength={20} name="phone" type="tel" placeholder="+91" data-testid="input-order-phone" className="field"/></label><label className="field-label">Email <span className="font-normal text-[#849086]">(optional)</span><input name="email" type="email" placeholder="you@example.com" data-testid="input-order-email" className="field"/></label></div><label className="field-label">Pickup location<input required minLength={2} name="pickupLocation" placeholder="Area, landmark or partner location" data-testid="input-order-location" className="field"/></label><label className="field-label">Preferred pickup time<input required minLength={2} name="pickupTime" placeholder="Today, 1:00–1:30 pm" data-testid="input-order-time" className="field"/></label><label className="field-label">Anything we should know? <span className="font-normal text-[#849086]">(optional)</span><textarea name="note" maxLength={500} rows={3} placeholder="Allergies, a note for the kitchen…" data-testid="input-order-note" className="field resize-y"/></label>{mutation.isError && <div role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">We couldn’t send that through. Check your details and try again.</div>}<button type="submit" disabled={mutation.isPending} className="btn-primary mt-1 w-full disabled:opacity-60" data-testid="button-submit-order">{mutation.isPending ? 'Sending your enquiry…' : `Send enquiry · ${rupees(total)}`} <ArrowRight size={15}/></button>
      </form></div>}
  </div>;
}

function PartnerPage() {
  const qc = useQueryClient();
  const mutation = useCreateGymPartnership({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMemberEnquiriesQueryKey() }); } } });
  const [interestError, setInterestError] = useState(false);
  if (mutation.isSuccess) return <div className="page-wrap max-w-3xl py-16"><FormSuccess title="Thanks for reaching out." body={mutation.data.message || 'Our partnerships team will be in touch soon.'} reference={mutation.data.id}/></div>;
  return <div className="page-wrap py-10 md:py-16"><div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr]"><div className="lg:sticky lg:top-28 lg:self-start"><div className="eyebrow">For gyms and studios</div><h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.04] tracking-[-.065em] text-[#20352c] sm:text-6xl">Better food.<br/><span className="serif font-medium italic text-[#668052]">Better training days.</span></h1><p className="mt-5 max-w-md text-sm leading-7 text-[#68766b]">Let’s give your members food that fits around their workouts and their lives. Tell us a little about your space.</p><div className="mt-8 grid gap-3">{[['01', 'Made for your members', 'Simple, satisfying options for post-workout and everyday.'], ['02', 'A local partnership', 'We work with your team to make the setup feel easy.'], ['03', 'No big promises', 'Just a practical conversation about what could work.']].map(([number, title, body]) => <div className="flex gap-4 rounded-2xl border border-[#e0e3d8] bg-[#f0f1e8] p-4" key={number}><span className="font-display pt-0.5 text-sm font-bold text-[#718c5d]">{number}</span><div><h3 className="text-sm font-bold text-[#304937]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#718073]">{body}</p></div></div>)}</div></div>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const interests = form.getAll('interests').map(String); if (!interests.length) { setInterestError(true); return; } setInterestError(false); mutation.mutate({ data: { gymName: String(form.get('gymName')), managerName: String(form.get('managerName')), phone: String(form.get('phone')), email: String(form.get('email')), location: String(form.get('location')), memberCount: Number(form.get('memberCount')), hasCafeteria: form.get('hasCafeteria') === 'yes', interests } }); }} className="grid gap-4 rounded-[24px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-7">
        <div className="mb-1"><div className="eyebrow">Let’s talk</div><h2 className="font-display mt-1 text-2xl font-bold tracking-[-.05em] text-[#20352c]">A few details about your gym</h2></div>
        <label className="field-label">Gym or studio name<input required minLength={2} name="gymName" placeholder="Your gym's name" data-testid="input-partner-gym" className="field"/></label><label className="field-label">Your name<input required minLength={2} name="managerName" placeholder="Manager or owner" data-testid="input-partner-manager" className="field"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Phone<input required minLength={8} name="phone" type="tel" placeholder="+91" data-testid="input-partner-phone" className="field"/></label><label className="field-label">Email<input required type="email" name="email" placeholder="you@gym.com" data-testid="input-partner-email" className="field"/></label></div><label className="field-label">Location<input required minLength={2} name="location" placeholder="Neighbourhood, city" data-testid="input-partner-location" className="field"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Approx. member count<input required min="1" max="100000" type="number" name="memberCount" placeholder="e.g. 350" data-testid="input-partner-members" className="field"/></label><label className="field-label">Do you have a cafeteria?<select name="hasCafeteria" data-testid="select-partner-cafeteria" className="field"><option value="no">Not right now</option><option value="yes">Yes</option></select></label></div><fieldset><legend className="field-label mb-2">What would you like to explore?</legend><div className="grid gap-2 sm:grid-cols-2">{[['food', 'Healthy food for members'], ['pickup', 'Pickup ordering'], ['events', 'Nutrition events'], ['other', 'Let’s discuss options']].map(([value,label]) => <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e0e3d8] px-3 py-3 text-xs font-semibold text-[#536457]" key={value}><input type="checkbox" name="interests" value={value} onChange={(e) => { if (e.target.checked) setInterestError(false); }} className="accent-[#557b4c]" data-testid={`checkbox-interest-${value}`}/>{label}</label>)}</div>{interestError && <p className="mt-2 text-xs text-[#9b5142]" role="alert">Choose at least one option so we know where to start.</p>}</fieldset>{mutation.isError && <p role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">We couldn’t send your enquiry. Please review your details and try again.</p>}<button className="btn-primary mt-1 w-full disabled:opacity-60" disabled={mutation.isPending} data-testid="button-submit-partner">{mutation.isPending ? 'Sending enquiry…' : 'Send partnership enquiry'} <ArrowRight size={15}/></button><p className="text-center text-[10px] text-[#879187]">No pressure, just a friendly conversation.</p>
      </form></div></div>;
}

function ContactPage() {
  const qc = useQueryClient();
  const mutation = useCreateContactMessage({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMemberEnquiriesQueryKey() }); } } });
  if (mutation.isSuccess) return <div className="page-wrap max-w-3xl py-16"><FormSuccess title="Message received." body={mutation.data.message || 'Thanks for getting in touch. We’ll be back with you soon.'} reference={mutation.data.id}/></div>;
  return <div className="page-wrap py-11 md:py-16"><div className="grid gap-10 md:grid-cols-[.8fr_1.2fr]"><div><div className="eyebrow">We’re listening</div><h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-.065em] text-[#20352c] sm:text-6xl">Have a thought?<br/><span className="serif font-medium italic text-[#668052]">Let’s hear it.</span></h1><p className="mt-5 max-w-sm text-sm leading-7 text-[#68766b]">A question, an idea, a little feedback — send it our way. A real person from our team will get back to you.</p><div className="mt-8 rounded-[22px] bg-[#e8eddc] p-5"><div className="eyebrow">A quick note</div><p className="mt-2 text-sm leading-6 text-[#617064]">For gym partnerships, we have a few extra questions to help us start in the right place.</p><Link href="/partner" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#315f43] no-underline">Partnership enquiry <ArrowRight size={15}/></Link></div></div>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); mutation.mutate({ data: { name: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')) || undefined, subject: String(form.get('subject')), message: String(form.get('message')) } }); }} className="grid gap-4 rounded-[24px] border border-[#e0e3d8] bg-[#fbfaf6] p-5 sm:p-7"><div><div className="eyebrow">Send us a message</div><h2 className="font-display mt-1 text-2xl font-bold tracking-[-.05em] text-[#20352c]">We’ll take it from here.</h2></div><label className="field-label">Your name<input required minLength={2} name="name" placeholder="Name" data-testid="input-contact-name" className="field"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Email<input required type="email" name="email" placeholder="you@example.com" data-testid="input-contact-email" className="field"/></label><label className="field-label">Phone <span className="font-normal text-[#849086]">(optional)</span><input name="phone" type="tel" placeholder="+91" data-testid="input-contact-phone" className="field"/></label></div><label className="field-label">What’s this about?<input required minLength={2} name="subject" placeholder="A quick subject line" data-testid="input-contact-subject" className="field"/></label><label className="field-label">Your message<textarea required minLength={5} maxLength={3000} rows={5} name="message" placeholder="Write us a note…" data-testid="input-contact-message" className="field resize-y"/></label>{mutation.isError && <p role="alert" className="rounded-xl bg-[#f6e6e1] p-3 text-xs text-[#9b5142]">We couldn’t send that just now. Please try again.</p>}<button type="submit" disabled={mutation.isPending} className="btn-primary w-full disabled:opacity-60" data-testid="button-submit-contact">{mutation.isPending ? 'Sending message…' : 'Send message'} <ArrowRight size={15}/></button></form></div></div>;
}

function RouteSeo({ title, description }: { title: string; description: string }) {
  useSeo(title, description);
  return null;
}

function Router() {
  const [cart, setCart] = useState<CartState>(loadCart);
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* storage unavailable */ } }, [cart]);
  const cartValue = useMemo<CartContextValue>(() => ({
    cart,
    add: (food) => setCart((current) => ({ ...current, [food.slug]: { food, quantity: Math.min(20, (current[food.slug]?.quantity || 0) + 1) } })),
    change: (slug, amount) => setCart((current) => { const item = current[slug]; if (!item) return current; const quantity = item.quantity + amount; if (quantity <= 0) { const next = { ...current }; delete next[slug]; return next; } return { ...current, [slug]: { ...item, quantity: Math.min(20, quantity) } }; }),
    clear: () => setCart({}),
  }), [cart]);
  const [location] = useLocation();
  const seo = ROUTE_SEO[location];
  return <CartContext.Provider value={cartValue}><ErrorBoundary resetKey={location}><Shell>{seo && <RouteSeo title={seo[0]} description={seo[1]}/>}<Switch>
    <Route path="/" component={HomeRedirect}/>
    <Route path="/sign-in/*?" component={SignInPage}/>
    <Route path="/sign-up/*?" component={SignUpPage}/>
    <Route path="/admin/sign-in/*?" component={StaffSignInPage}/>
    <Route path="/admin"><AdminHome/></Route>
    <Route path="/admin/catalogue"><AdminCataloguePage/></Route>
    <Route path="/admin/enquiries"><AdminEnquiriesPage/></Route>
    <Route path="/member"><Gate><MemberOverview/></Gate></Route>
    <Route path="/member/profile"><Gate><MemberProfilePage/></Gate></Route>
    <Route path="/member/saved"><Gate><MemberSavedPage/></Gate></Route>
    <Route path="/member/plans"><Gate><MemberPlansPage/></Gate></Route>
    <Route path="/member/enquiries"><Gate><MemberEnquiriesPage/></Gate></Route>
    <Route path="/food" component={FoodCatalogue}/>
    <Route path="/food/:slug"><ListingDetail kind="food"/></Route>
    <Route path="/recipes" component={RecipesPage}/>
    <Route path="/recipes/:slug"><ListingDetail kind="recipe"/></Route>
    <Route path="/nutrition/calorie-calculator" component={CalculatorPage}/>
    <Route path="/gyms" component={GymsPage}/>
    <Route path="/partner" component={PartnerPage}/>
    <Route path="/contact" component={ContactPage}/>
    <Route path="/cart" component={OrderPage}/>
    <Route path="/articles" component={ArticlesPage}/>
    <Route path="/articles/:slug" component={ArticlePage}/>
    <Route path="/newsletter" component={NewsletterPage}/>
    <Route path="/assistant" component={AssistantPage}/>
    <Route path="/challenges" component={ChallengesPage}/>
    <Route component={NotFound}/>
  </Switch></Shell></ErrorBoundary></CartContext.Provider>;
}

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string): string { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }

const clerkAppearance = {
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#315f43', colorForeground: '#20352c', colorMutedForeground: '#5e715f', colorBackground: '#fbfaf6', colorInput: '#f6f4ec', colorInputForeground: '#20352c', colorDanger: '#9b5142', colorNeutral: '#20352c', fontFamily: 'DM Sans, sans-serif', borderRadius: '12px' },
  elements: {
    cardBox: { width: '440px', maxWidth: '100%', background: '#fbfaf6', border: '1px solid #e0e3d8', borderRadius: '28px', boxShadow: '0 16px 40px rgba(39,57,43,.08)' },
    card: { background: 'transparent', boxShadow: 'none', border: 0 },
    footer: { background: 'transparent', boxShadow: 'none', border: 0 },
    headerTitle: { color: '#20352c', fontFamily: 'Manrope, sans-serif', fontWeight: 800, letterSpacing: '-.04em' },
    headerSubtitle: { color: '#5e715f' }, socialButtonsBlockButtonText: { color: '#20352c', fontWeight: 600 }, formFieldLabel: { color: '#42584a' },
    footerActionLink: { color: '#315f43', fontWeight: 700 }, footerActionText: { color: '#5e715f' }, dividerText: { color: '#5e715f' },
    identityPreviewEditButton: { color: '#315f43' }, formFieldSuccessText: { color: '#315f43' }, alertText: { color: '#9b5142' },
    logoBox: { height: '48px' }, logoImage: { height: '48px' },
    socialButtonsBlockButton: { border: '1px solid #bdc9b5', borderRadius: '999px', background: 'transparent' },
    formButtonPrimary: { background: '#315f43', borderRadius: '999px', fontWeight: 700 },
    formFieldInput: { background: '#f6f4ec', border: '1px solid #d8ddcf' }, dividerLine: { background: '#d9ddcf' },
  },
};

function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="page-wrap flex min-h-[70dvh] flex-col items-center justify-center gap-5 py-10"><p className="max-w-sm text-center text-sm leading-6 text-[#68766b]">Sign in to save foods, plan your week and keep your pickup enquiries together. Browsing stays open to everyone.</p>{children}</div>;
}
function SignInPage() { return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></AuthFrame>; }
function SignUpPage() { return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></AuthFrame>; }

function Gate({ children }: { children: ReactNode }) {
  const { userId } = useMemberSession();
  return <><Show when="signed-in"><div key={userId ?? 'x'}>{children}</div></Show><Show when="signed-out"><Redirect to="/sign-in"/></Show></>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (prev.current !== undefined && prev.current !== id) { qc.clear(); clearPlanLeaveWarning(); }
    // Includes the first signed-out load and switches to a different member.
    try { clearOtherPlanDrafts(id); } catch { /* The editor reports unavailable storage. */ }
    prev.current = id;
  }), [addListener, qc]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your Nutrio space' } }, signUp: { start: { title: 'Make your space', subtitle: 'Save foods and plan your week' } } }}
    routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator/><TooltipProvider><Router/><Toaster/></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath} hook={useGuardedLocation}><ClerkProviderWithRoutes/></WouterRouter>;
}

export default App;
