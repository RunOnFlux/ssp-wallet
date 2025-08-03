import { useEffect } from 'react';

import { useNavigate } from 'react-router';

import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setInitialContactsState,
} from '../../store';

import { useAppDispatch } from '../../hooks';

let logoutTimeout: string | number | NodeJS.Timeout | undefined;

type lastActivity = Record<string, number>;

const tenMins = 10 * 60 * 1000;

// this is when user has application focused.
function AutoLogout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const browser = window.chrome || window.browser;
  useEffect(() => {
    document.removeEventListener('click', refresh);
    document.addEventListener('click', refresh);
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
          refresh();
        } catch (error) {
          console.log(error);
        }
      } else {
        refresh();
      }
    })();

    return () => {
      document.removeEventListener('click', refresh);
    };
  }, []);

  const refresh = () => {
    void (async function () {
      const curTime = new Date().getTime();
      if (browser?.storage?.session) {
        await browser.storage.session.set({
          lastActivity: curTime,
        });
      }
    })();
    if (logoutTimeout) {
      clearTimeout(logoutTimeout);
    }
    logoutTimeout = setTimeout(() => {
      console.log('auto logout after 10 mins of inactivity');
      logout();
    }, tenMins); // log out after 10 mins of inactivity
  };

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
    document.removeEventListener('click', refresh);
    clearTimeout(logoutTimeout);
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
