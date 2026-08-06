import { useEffect, useRef } from 'react';

import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setInitialContactsState,
} from '../../store';

import { toast } from '../../lib/toast';
import { useAppDispatch } from '../../hooks';

let logoutTimeout: string | number | NodeJS.Timeout | undefined;
let warningTimeout: string | number | NodeJS.Timeout | undefined;
let lastRefreshAt = 0;

type lastActivity = Record<string, number>;

const tenMins = 10 * 60 * 1000;
// heads-up before the wallet locks, so a composed transaction is never
// dropped without warning
const warningLeadMs = 60 * 1000;
// keydown/input/scroll fire per keystroke — one storage write + timer reset
// every few seconds is plenty for a ten minute idle timer
const refreshThrottleMs = 5 * 1000;
const warningToastKey = 'ssp-auto-logout-warning';

/**
 * Every event that means "the user is still here". Click alone missed the
 * whole keyboard path — tab into the receiver field, paste an address, type an
 * amount, read the review card — and locked mid-send, discarding the composed
 * transaction. Registered in the capture phase on document so non-bubbling
 * events (scroll) and stopPropagation'd ones still count.
 */
const activityEvents = [
  'click',
  'keydown',
  'input',
  'focusin',
  'scroll',
] as const;

// this is when user has application focused.
function AutoLogout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['home']);
  const browser = window.chrome || window.browser;
  // The listener identity must be stable across renders: `refresh` is rebuilt
  // every render and removeEventListener only matches the exact function that
  // was registered, so the handler indirects through a ref.
  const refreshRef = useRef<(force?: boolean) => void>(() => {});
  const onActivityRef = useRef(() => {
    refreshRef.current();
  });

  useEffect(() => {
    addActivityListeners();
    // check if have some recent activity
    // store last activity time in session storage, if its less than 10 mins, continue and stay, store new one
    void (async function () {
      if (browser?.storage?.session) {
        try {
          const curTime = new Date().getTime();
          const resp: lastActivity =
            await browser.storage.session.get('lastActivity');
          if (typeof resp.lastActivity === 'number') {
            if (resp.lastActivity + tenMins < curTime) {
              logout();
              return;
            }
          }
          await browser.storage.session.set({
            lastActivity: curTime,
          });
          refresh(true);
        } catch (error) {
          console.log(error);
        }
      } else {
        refresh(true);
      }
    })();

    return () => {
      removeActivityListeners();
    };
  }, []);

  const addActivityListeners = () => {
    const onActivity = onActivityRef.current;
    activityEvents.forEach((event) => {
      document.removeEventListener(event, onActivity, true);
      document.addEventListener(event, onActivity, {
        capture: true,
        passive: true,
      });
    });
  };

  const removeActivityListeners = () => {
    const onActivity = onActivityRef.current;
    activityEvents.forEach((event) => {
      document.removeEventListener(event, onActivity, true);
    });
  };

  const clearTimers = () => {
    if (warningTimeout) {
      clearTimeout(warningTimeout);
      warningTimeout = undefined;
    }
    if (logoutTimeout) {
      clearTimeout(logoutTimeout);
      logoutTimeout = undefined;
    }
  };

  const warnBeforeLogout = () => {
    // keyed: AutoLogout is mounted by both the shell and the page header, so
    // the same warning must replace itself instead of stacking
    void toast.open({
      key: warningToastKey,
      type: 'warning',
      duration: warningLeadMs / 1000,
      content: t(
        'home:autoLogout.warning',
        'You will be logged out in 1 minute due to inactivity.',
      ),
    });
  };

  // `force` arms the timers on mount regardless of the throttle window — a
  // fresh login moments after a logout must never be left without a timer.
  const refresh = (force = false) => {
    const curTime = new Date().getTime();
    if (!force && curTime - lastRefreshAt < refreshThrottleMs) {
      return;
    }
    lastRefreshAt = curTime;
    toast.destroy(warningToastKey);
    void (async function () {
      if (browser?.storage?.session) {
        await browser.storage.session.set({
          lastActivity: curTime,
        });
      }
    })();
    clearTimers();
    warningTimeout = setTimeout(warnBeforeLogout, tenMins - warningLeadMs);
    logoutTimeout = setTimeout(() => {
      console.log('auto logout after 10 mins of inactivity');
      logout();
    }, tenMins); // log out after 10 mins of inactivity
  };

  refreshRef.current = refresh;

  const logout = () => {
    void (async function () {
      if (browser?.storage?.session) {
        try {
          await browser.storage.session.clear();
        } catch (error) {
          console.log(error);
        }
      }
      continueLogout();
    })();
  };

  const continueLogout = () => {
    removeActivityListeners();
    clearTimers();
    toast.destroy(warningToastKey);
    navigate('/login');
    setTimeout(() => {
      setInitialStateForAllChains();
      dispatch(setSSPInitialState());
      dispatch(setInitialContactsState());
      dispatch(setPasswordBlobInitialState());
    }, 100);
  };

  return <></>;
}

export default AutoLogout;
