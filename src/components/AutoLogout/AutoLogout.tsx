import { useEffect } from 'react';

import { useNavigate } from 'react-router-dom';

import { setFluxInitialState, setPasswordBlobInitialState } from '../../store';

import { useAppDispatch } from '../../hooks';

let logoutTimeout: string | number | NodeJS.Timeout | undefined;

type lastActivity = Record<string, number>;

const tenMins = 10 * 60 * 1000;

// this is when user has application focused.
function AutoLogout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  useEffect(() => {
    // if (alreadyMounted.current) return;
    // alreadyMounted.current = true;
    document.removeEventListener('click', refresh);
    document.addEventListener('click', refresh);
    // check if have some recent activity
    // store last activity time in session storage, if its less than 10 mins, continue and stay, store new one
    void (async function () {
      if (chrome?.storage?.session) {
        try {
          const curTime = new Date().getTime();
          const resp: lastActivity = await chrome.storage.session.get(
            'lastActivity',
          );
          if (resp.lastActivity) {
            if (resp.lastActivity + tenMins < curTime) {
              logout();
              return;
            }
          }
          await chrome.storage.session.set({
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
      // on unomunt
      console.log('unmounting auto logout');
      document.removeEventListener('click', refresh);
      if (logoutTimeout) {
        clearTimeout(logoutTimeout);
      }
    };
  });

  const refresh = () => {
    console.log('refreshing');
    void (async function () {
      const curTime = new Date().getTime();
      if (chrome?.storage?.session) {
        await chrome.storage.session.set({
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
      if (chrome?.storage?.session) {
        try {
          await chrome.storage.session.clear();
        } catch (error) {
          console.log(error);
        }
      }
      document.removeEventListener('click', refresh);
      clearTimeout(logoutTimeout);
      dispatch(setFluxInitialState());
      dispatch(setPasswordBlobInitialState());
      navigate('/login');
    })();
  };

  return <></>;
}

export default AutoLogout;
