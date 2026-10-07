import { useUser } from '@clerk/react';
import {
  getGetMemberEnquiriesQueryKey, getGetMemberFavouritesQueryKey, getGetMemberPlansQueryKey, getGetMemberProfileQueryKey,
  useGetMemberEnquiries, useGetMemberFavourites, useGetMemberPlans, useGetMemberProfile,
} from '@workspace/api-client-react';

export function useMemberSession() {
  const { isLoaded, isSignedIn, user } = useUser();
  return { ready: isLoaded, signedIn: !!isSignedIn, userId: user?.id ?? null, firstName: user?.firstName ?? '', email: user?.primaryEmailAddress?.emailAddress ?? '' };
}
export function useProfile() {
  const { signedIn } = useMemberSession();
  return useGetMemberProfile({ query: { enabled: signedIn, queryKey: getGetMemberProfileQueryKey() } });
}
export function useFavourites() {
  const { signedIn } = useMemberSession();
  return useGetMemberFavourites({ query: { enabled: signedIn, queryKey: getGetMemberFavouritesQueryKey() } });
}
export function usePlans() {
  const { signedIn } = useMemberSession();
  return useGetMemberPlans({ query: { enabled: signedIn, queryKey: getGetMemberPlansQueryKey() } });
}
export function useEnquiries() {
  const { signedIn } = useMemberSession();
  return useGetMemberEnquiries({ query: { enabled: signedIn, queryKey: getGetMemberEnquiriesQueryKey(), refetchInterval: 20000, refetchOnWindowFocus: true } });
}

import {
  getGetAssistantHistoryQueryKey, getGetChallengesQueryKey, getGetMemberChallengesQueryKey,
  useGetAssistantHistory, useGetChallenges, useGetMemberChallenges,
} from '@workspace/api-client-react';

export function useAssistantHistory(pending: boolean) {
  const { signedIn, userId } = useMemberSession();
  return useGetAssistantHistory({ query: { enabled: signedIn && !!userId, queryKey: [...getGetAssistantHistoryQueryKey(), userId], refetchInterval: (query) => pending || query.state.data?.turns.some((turn) => turn.status === 'pending') ? 3000 : 20000, refetchOnWindowFocus: true, staleTime: 5000 } });
}
export function usePublicChallenges() {
  return useGetChallenges({ query: { queryKey: getGetChallengesQueryKey(), refetchInterval: 20000, refetchOnWindowFocus: true, staleTime: 10000 } });
}
export function useMyChallenges() {
  const { signedIn, userId } = useMemberSession();
  return useGetMemberChallenges({ query: { enabled: signedIn && !!userId, queryKey: [...getGetMemberChallengesQueryKey(), userId], refetchInterval: 20000, refetchOnWindowFocus: true, staleTime: 10000 } });
}
