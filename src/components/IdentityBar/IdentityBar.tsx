import { useNavigate } from 'react-router';
import { Image, Tooltip } from 'antd';
import { LockOutlined, DownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from '../../hooks';
import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setInitialContactsState,
} from '../../store';
import { blockchains } from '@storage/blockchains';
import Identicon from '../Identicon/Identicon';
import WalletName from '../WalletName/WalletName';
import './IdentityBar.css';

interface Props {
  /** Opens the wallet/chain switcher sheet. */
  onOpenSwitcher: () => void;
}

/**
 * IdentityBar — Phase 3 top chrome. Identity + context ONLY:
 * `[identicon · walletName · chain ▾]` pill (tap → switcher sheet) on the left
 * and a lock button on the right. No gear, no hamburger — those places live in
 * the bottom tab bar / Settings now.
 */
function IdentityBar({ onOpenSwitcher }: Props) {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const address = wallets[walletInUse]?.address ?? '';
  const browser = window.chrome || window.browser;

  const logout = () => {
    void (async function () {
      if (browser?.storage?.session) {
        try {
          await browser.storage.session.clear();
        } catch (error) {
          console.log(error);
        }
      }
      setInitialStateForAllChains();
      dispatch(setSSPInitialState());
      dispatch(setInitialContactsState());
      dispatch(setPasswordBlobInitialState());
      navigate('/login');
    })();
  };

  const chainLabel = `${blockchainConfig.name}${
    blockchainConfig.name.includes(' ') ? '' : ` ${t('common:chain')}`
  }`;

  return (
    <header className="identity-bar">
      <button
        type="button"
        className="identity-pill"
        onClick={onOpenSwitcher}
        aria-label={t('home:switcher.open')}
        data-tutorial="wallet-selector"
      >
        <Identicon value={address || walletInUse} size={26} />
        <span className="identity-pill-text">
          <span className="identity-pill-wallet">
            <WalletName
              walletId={walletInUse}
              chain={activeChain}
              editable={false}
            />
          </span>
          <span className="identity-pill-chain">
            <Image
              height={12}
              width={12}
              preview={false}
              src={blockchainConfig.logo}
            />
            {chainLabel}
          </span>
        </span>
        <DownOutlined className="identity-pill-caret" />
      </button>
      <Tooltip title={t('home:navbar.lock', 'Lock')} placement="bottomRight">
        <button
          type="button"
          className="identity-lock"
          onClick={logout}
          aria-label={t('home:navbar.lock', 'Lock')}
        >
          <LockOutlined />
        </button>
      </Tooltip>
    </header>
  );
}

export default IdentityBar;
