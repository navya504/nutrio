import { useEffect } from 'react';
import { navigate, useBrowserLocation } from 'wouter/use-browser-location';

const INDEX = '__nutrioHistoryIndex';
let warning: (() => string) | null = null;
let currentIndex = 0;
let currentUrl = '';

export function confirmPlanLeave() {
  return !warning || window.confirm(warning());
}

export function clearPlanLeaveWarning() {
  warning = null;
}

// Wouter uses this for links, redirects, and imperative navigation.
const guardedNavigate: typeof navigate = (to, options) => {
  if (new URL(to, window.location.href).href !== window.location.href && !confirmPlanLeave()) return;
  const nextIndex = options?.replace ? currentIndex : currentIndex + 1;
  navigate(to, { ...options, state: { ...options?.state, [INDEX]: nextIndex } });
  currentIndex = nextIndex;
  currentUrl = window.location.href;
};

export const useGuardedLocation: typeof useBrowserLocation = (options) => {
  const [location] = useBrowserLocation(options);
  return [location, guardedNavigate];
};

function installNavigationTracking() {
    currentIndex = Number.isInteger(history.state?.[INDEX]) ? history.state[INDEX] : 0;
    currentUrl = window.location.href;
    history.replaceState({ ...history.state, [INDEX]: currentIndex }, '');
    let restoring = false;
    const onPop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; return; }
      const nextIndex = event.state?.[INDEX];
      if (window.location.href !== currentUrl && !confirmPlanLeave()) {
        // Stop Wouter from rendering the destination while we restore the entry.
        event.stopImmediatePropagation();
        if (Number.isInteger(nextIndex) && nextIndex !== currentIndex) {
          restoring = true;
          history.go(currentIndex - nextIndex);
        } else {
          history.pushState({ [INDEX]: currentIndex }, '', currentUrl);
        }
        return;
      }
      currentIndex = Number.isInteger(nextIndex) ? nextIndex : 0;
      currentUrl = window.location.href;
    };
    window.addEventListener('popstate', onPop, true);
    return () => window.removeEventListener('popstate', onPop, true);
}

// Register before React/Wouter subscribe. Otherwise an earlier location
// subscriber can unmount the editor and clear its warning before we see Back.
const removeTracking = installNavigationTracking();
if (import.meta.hot) import.meta.hot.dispose(removeTracking);

export function usePlanLeaveWarning(dirty: boolean, recoveryAvailable: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const message = () => recoveryAvailable
      ? 'You have unsaved meal-plan changes. Leave this page? A recovery copy will stay on this browser, but you still need to save it. Signing out clears that copy.'
      : 'You have unsaved meal-plan changes and this browser could not keep a recovery copy. Leave and lose these changes?';
    warning = message;
    const onUnload = (event: BeforeUnloadEvent) => {
      if (warning !== message) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      if (warning === message) warning = null;
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty, recoveryAvailable]);
}
