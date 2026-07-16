import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import { toast } from '../../lib/toast';
import { useAppSelector, useAppDispatch } from '../../hooks';
import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
  setWitnessScript,
  setSspWalletInternalIdentity,
  setSspWalletKeyInternalIdentity,
  setSspWalletKeyInternalIdentityWitnessScript,
  setSspWalletExternalIdentity,
  setInitialContactsState,
} from '../../store';
import Key from '../Key/Key';
import SspConnect from '../SspConnect/SspConnect.tsx';
import TutorialTrigger from '../Tutorial/TutorialTrigger.tsx';
import AutoLogout from '../AutoLogout/AutoLogout';
import IdentityBar from '../IdentityBar/IdentityBar';
import TabBar from '../TabBar/TabBar';
import WalletSwitcher from '../WalletSwitcher/WalletSwitcher';
import {
  generateMultisigAddress,
  generateInternalIdentityAddress,
  generateExternalIdentityAddress,
} from '../../lib/wallet.ts';
import { ensureRecoveryEnvelope } from '../../lib/recoveryEnvelope.ts';
import { useTranslation } from 'react-i18next';
import { generatedWallets } from '../../types';
import { useWalletConnect } from '../../contexts/WalletConnectContext';
import { sspConfig } from '@storage/ssp';
import { useEnterpriseNotificationSync } from '../../hooks/useEnterpriseNotificationSync';
import { pathToTab, setLastTab } from '../../storage/navPrefs';
import './WalletShell.css';

/**
 * WalletShell — Phase 3 IA layout.
 *
 * Owns everything that must persist across the Home/Portfolio/Activity/Settings
 * tabs: the wallet-init side effects (address + identity derivation, recovery
 * envelope), the always-mounted SSP Key sync surface, the identity top bar and
 * the bottom tab bar. Individual tabs render into <Outlet/>. This replaces the
 * per-page <Navbar> as the primary chrome — the tab content pages are pure.
 */
function WalletShell() {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { setWalletConnectNavigation } = useWalletConnect();
  const [isNewWallet, setIsNewWallet] = useState(false);
  const [walletSynced, setWalletSynced] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { activeChain, identityChain, sspWalletKeyInternalIdentity } =
    useAppSelector((state) => state.sspState);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { xpubKey: xpubKeyIdentity, xpubWallet: xpubWalletIdentity } =
    useAppSelector((state) => state[identityChain]);
  const { xpubKey, xpubWallet, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const browser = window.chrome || window.browser;

  useEnterpriseNotificationSync();

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({ type, content });
  };

  const activeTab = pathToTab(location.pathname) ?? 'home';

  // Persist the current tab so the popup re-opens where the user left off
  // (append-only navPrefs key — never touches sspConfig or wallet state).
  useEffect(() => {
    void setLastTab(activeTab);
  }, [activeTab]);

  const generateAddress = () => {
    try {
      const splittedDerPath = walletInUse.split('-');
      const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
      const addressIndex = Number(splittedDerPath[1]);
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        activeChain,
      );
      setAddress(activeChain, walletInUse, addrInfo.address);
      setRedeemScript(activeChain, walletInUse, addrInfo.redeemScript ?? '');
      setWitnessScript(activeChain, walletInUse, addrInfo.witnessScript ?? '');
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem('wallets-' + activeChain)) ?? {};
        if (activeChain === identityChain && walletInUse === '0-0') {
          if (generatedWallets['0-0'] !== addrInfo.address) {
            console.log('clearing localforage');
            await localForage.clear();
          }
        }
        generatedWallets[walletInUse] = addrInfo.address;
        await localForage.setItem('wallets-' + activeChain, generatedWallets);
      })();
    } catch (error) {
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const generateSSPIdentity = () => {
    try {
      const generatedSspWalletInternalIdentity =
        generateInternalIdentityAddress(xpubWalletIdentity, identityChain);
      dispatch(
        setSspWalletInternalIdentity(generatedSspWalletInternalIdentity),
      );
      const generatedSspWalletKeyInternalIdentity = generateMultisigAddress(
        xpubWalletIdentity,
        xpubKeyIdentity,
        10,
        0,
        identityChain,
      );
      dispatch(
        setSspWalletKeyInternalIdentity(
          generatedSspWalletKeyInternalIdentity.address,
        ),
      );
      if (generatedSspWalletKeyInternalIdentity.witnessScript) {
        dispatch(
          setSspWalletKeyInternalIdentityWitnessScript(
            generatedSspWalletKeyInternalIdentity.witnessScript,
          ),
        );
      }
      const generatedSspWalletExternaldentity =
        generateExternalIdentityAddress(xpubWalletIdentity);
      dispatch(setSspWalletExternalIdentity(generatedSspWalletExternaldentity));
    } catch (error) {
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const config = sspConfig() as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const tutorial = config?.tutorial;
      if (
        !tutorial ||
        (tutorial &&
          'completed' in tutorial &&
          'currentStep' in tutorial &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          !tutorial.completed &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          !tutorial.cancelled &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          tutorial.currentStep === 0)
      ) {
        setIsNewWallet(true);
      }
    } catch (error) {
      console.log('Error checking tutorial config:', error);
      setIsNewWallet(true);
    }

    if (!xpubWallet) {
      navigate('/login');
      return;
    }
  }, []);

  useEffect(() => {
    if (!xpubKeyIdentity) return;
    generateSSPIdentity();
  }, [xpubKeyIdentity]);

  useEffect(() => {
    if (
      !passwordBlob ||
      !xpubKeyIdentity ||
      !sspWalletKeyInternalIdentity ||
      !identityChain
    )
      return;
    void ensureRecoveryEnvelope({
      passwordBlob,
      xpubKeyIdentity,
      wkIdentity: sspWalletKeyInternalIdentity,
      identityChain,
    });
  }, [
    passwordBlob,
    xpubKeyIdentity,
    sspWalletKeyInternalIdentity,
    identityChain,
  ]);

  useEffect(() => {
    if (!xpubKey) return;
    generateAddress();
    setWalletSynced(true);
  }, [xpubKey, activeChain]);

  useEffect(() => {
    setWalletConnectNavigation(navigate);
  }, [navigate, setWalletConnectNavigation]);

  const keySynchronised = (status: boolean) => {
    if (status === false) {
      void (async function () {
        if (browser?.storage?.session) {
          try {
            await browser.storage.session.clear();
          } catch (error) {
            console.log(error);
          }
        }
        navigate('/login');
        setTimeout(() => {
          setInitialStateForAllChains();
          dispatch(setSSPInitialState());
          dispatch(setInitialContactsState());
          dispatch(setPasswordBlobInitialState());
        }, 100);
      })();
    }
  };

  return (
    <div className="wallet-shell">
      {/* TabBar renders first so in side-panel mode it becomes the left rail;
          in popup mode it is position:fixed so document order is irrelevant. */}
      <TabBar activeTab={activeTab} />
      <div className="wallet-shell-main">
        <IdentityBar onOpenSwitcher={() => setSwitcherOpen(true)} />
        <main className="wallet-shell-content">
          <Outlet />
        </main>
      </div>
      <WalletSwitcher open={switcherOpen} openAction={setSwitcherOpen} />
      <Key synchronised={keySynchronised} />
      <SspConnect />
      <TutorialTrigger isNewWallet={isNewWallet} walletSynced={walletSynced} />
      <AutoLogout />
    </div>
  );
}

export default WalletShell;
