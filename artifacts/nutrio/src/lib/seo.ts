import { useEffect } from 'react';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

export function useSeo(title: string, description: string) {
  useEffect(() => {
    const full = title.includes('Nutrio') ? title : `${title} | Nutrio`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', window.location.href);
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', description);
  }, [title, description]);
}

export const ROUTE_SEO: Record<string, [string, string]> = {
  '/': ['Nutrio - Eat Smart. Live Better.', 'Healthy, affordable food and recipes for young, fitness-minded people in India. Pick a goal and find what suits it.'],
  '/food': ['Healthy food menu', 'Browse Nutrio foods with full nutrition, allergens and prices. Filter by calories, protein, diet, budget and prep time.'],
  '/recipes': ['Healthy recipes', 'Simple, budget-aware recipes with quantities, steps and nutrition. Filter by calories, protein, diet and prep time.'],
  '/nutrition/calorie-calculator': ['Calorie and macro calculator', 'Estimate daily calories, protein, carbs and fat for weight loss, maintenance or muscle gain. For adults, general guidance only.'],
  '/gyms': ['Partner gyms in Hyderabad', 'Explore Nutrio partner gyms in Hyderabad. Verified partners are marked; sample entries are labelled as demonstrations.'],
  '/partner': ['Gym partnership', 'Run a gym? Tell Nutrio about your space and the food your members might enjoy.'],
  '/contact': ['Contact Nutrio', 'Send Nutrio a question, idea or request for updates.'],
  '/cart': ['Your order enquiry', 'Review your Nutrio pickup enquiry. This is an enquiry, not a payment or confirmed order.'],
};

export const ADMIN_SEO: Record<string, [string, string]> = {
  '/admin': ['Nutrio staff area', 'Staff sign-in for managing Nutrio menus, gym partners and enquiries.'],
  '/admin/catalogue': ['Staff catalogue', 'Create and edit Nutrio foods, recipes and gym listings, with availability and verification.'],
  '/admin/enquiries': ['Staff enquiries', 'Review incoming Nutrio enquiries and update status and staff notes.'],
};
