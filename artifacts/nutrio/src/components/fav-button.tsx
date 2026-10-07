import { Heart } from 'lucide-react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMemberFavouritesQueryKey, useSetMemberFavourite } from '@workspace/api-client-react';
import { useFavourites, useMemberSession } from '@/hooks/use-member';
import { useToast } from '@/hooks/use-toast';

export function FavButton({ kind, slug, name, label = false, className = '' }: { kind: 'food' | 'recipe'; slug: string; name: string; label?: boolean; className?: string }) {
  const { signedIn } = useMemberSession();
  const favs = useFavourites();
  const qc = useQueryClient();
  const { toast } = useToast();
  const set = useSetMemberFavourite({ mutation: {
    onSuccess: (list) => qc.setQueryData(getGetMemberFavouritesQueryKey(), list),
    onError: () => toast({ title: 'Could not update saved items', description: 'Please try again.', variant: 'destructive' }),
  } });
  const saved = !!favs.data?.some((f) => f.kind === kind && f.slug === slug);
  const base = label ? 'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#bdc9b5] px-5 text-sm font-bold text-[#20352c] hover:bg-[#e9eddf]' : 'grid h-9 w-9 place-items-center rounded-full bg-[#f1ebe0] text-[#a5543f] hover:bg-[#ead9ca]';
  const icon = <Heart size={17} fill={saved ? 'currentColor' : 'none'}/>;
  const text = label ? (saved ? 'Saved' : 'Save for later') : null;
  if (!signedIn) return <Link href="/sign-in" aria-label={`Sign in to save ${name}`} title="Sign in to save" data-testid={`link-save-${kind}-${slug}`} className={`${base} no-underline ${className}`}>{icon}{label && 'Sign in to save'}</Link>;
  return <button type="button" disabled={set.isPending} aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`} data-testid={`button-save-${kind}-${slug}`} onClick={() => set.mutate({ data: { kind, slug, saved: !saved } })} className={`${base} disabled:opacity-60 ${className}`}>{icon}{text}</button>;
}
