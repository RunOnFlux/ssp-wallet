import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { Drawer, Input, Button, Popconfirm, Divider, Image } from 'antd';
import {
  PlusOutlined,
  MinusOutlined,
  SearchOutlined,
  CheckOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { NoticeType } from 'antd/es/message/interface';
import { toast } from '../../lib/toast';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import {
  setAddress,
  setRedeemScript,
  setWitnessScript,
  setWalletInUse,
  removeWallet,
  setNodes,
  setTransactions,
  setBalance,
  setUnconfirmedBalance,
  setTokenBalances,
  setActivatedTokens,
  setImportedTokens,
} from '../../store';
import { blockchains, Token } from '@storage/blockchains';
import { generateMultisigAddress } from '../../lib/wallet.ts';
import { switchToChain } from '../../lib/chainSwitching';
import { formatCrypto, formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { getDisplayName, removeWalletName } from '../../storage/walletNames';
import Identicon from '../Identicon/Identicon';
import WalletName from '../WalletName/WalletName';
import {
  generatedWallets,
  transaction,
  node,
  tokenBalanceEVM,
  cryptos,
} from '../../types';
import './WalletSwitcher.css';

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject: balancesObj = { confirmed: '0.00', unconfirmed: '0.00' };

interface Props {
  open: boolean;
  openAction: (status: boolean) => void;
}

/**
 * WalletSwitcher — the single switcher sheet opened by the identity pill. It
 * replaces the old two-level Navbar <Select> dropdown: wallets on the active
 * chain (with balances + names), add / remove-last wallet, and a searchable
 * network switch. All the underlying store mutations are the SAME ones the
 * Navbar used (generate address, load per-wallet state, switchToChain).
 */
function WalletSwitcher({ open, openAction }: Props) {
  const { t } = useTranslation(['home', 'common']);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { wallets, walletInUse, xpubKey, xpubWallet } = useAppSelector(
    (state) => state[activeChain],
  );
  const walletNamesForChain = useAppSelector(
    (state) => state.walletNames?.chains[activeChain],
  );
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const blockchainConfig = blockchains[activeChain];

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({ type, content });
  };

  // fiat value = crypto price (chain) × fiat conversion (selected currency) —
  // the exact formula Balances.tsx uses.
  const fiatRate =
    (cryptoRates[activeChain] ?? 0) *
    (fiatRates[sspConfig().fiatCurrency] ?? 0);

  const walletIds = useMemo(() => {
    const ids = Object.keys(wallets);
    ids.sort((a, b) => +a.split('-')[1] - +b.split('-')[1]);
    ids.sort((a, b) => +a.split('-')[0] - +b.split('-')[0]);
    return ids;
  }, [wallets]);

  const filteredWalletIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return walletIds;
    return walletIds.filter((id) => {
      const name = (
        walletNamesForChain?.[id] ?? getDisplayName(activeChain, id)
      ).toLowerCase();
      const address = (wallets[id]?.address ?? '').toLowerCase();
      return name.includes(q) || address.includes(q) || id.includes(q);
    });
  }, [walletIds, query, walletNamesForChain, wallets, activeChain]);

  const chainKeys = Object.keys(blockchains) as (keyof cryptos)[];
  const filteredChains = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chainKeys;
    return chainKeys.filter(
      (c) =>
        blockchains[c].name.toLowerCase().includes(q) ||
        blockchains[c].symbol.toLowerCase().includes(q),
    );
  }, [query, chainKeys]);

  const walletFiat = (id: string): string => {
    const wal = wallets[id];
    if (!wal) return '';
    const total = new BigNumber(wal.balance)
      .plus(new BigNumber(wal.unconfirmedBalance))
      .dividedBy(10 ** blockchainConfig.decimals);
    return formatFiatWithSymbol(total.multipliedBy(new BigNumber(fiatRate)));
  };

  const walletCrypto = (id: string): string => {
    const wal = wallets[id];
    if (!wal) return '';
    const total = new BigNumber(wal.balance)
      .plus(new BigNumber(wal.unconfirmedBalance))
      .dividedBy(10 ** blockchainConfig.decimals);
    return `${formatCrypto(total)} ${blockchainConfig.symbol}`;
  };

  const generateAddress = (path: string) => {
    try {
      const [typeStr, addrStr] = path.split('-');
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        Number(typeStr) as 0 | 1,
        Number(addrStr),
        activeChain,
      );
      setAddress(activeChain, path, addrInfo.address);
      setRedeemScript(activeChain, path, addrInfo.redeemScript ?? '');
      setWitnessScript(activeChain, path, addrInfo.witnessScript ?? '');
      void (async function () {
        const gw: generatedWallets =
          (await localForage.getItem('wallets-' + activeChain)) ?? {};
        gw[path] = addrInfo.address;
        await localForage.setItem('wallets-' + activeChain, gw);
      })();
    } catch (error) {
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const selectWallet = (id: string) => {
    generateAddress(id);
    void (async function () {
      const txsWallet: transaction[] =
        (await localForage.getItem(`transactions-${activeChain}-${id}`)) ?? [];
      const balancesWallet: balancesObj =
        (await localForage.getItem(`balances-${activeChain}-${id}`)) ??
        balancesObject;
      const tokenBalances: tokenBalanceEVM[] =
        (await localForage.getItem(`token-balances-${activeChain}-${id}`)) ??
        [];
      const activatedTokens: string[] =
        (await localForage.getItem(`activated-tokens-${activeChain}-${id}`)) ??
        [];
      const nodesWallet: node[] =
        (await localForage.getItem(`nodes-${activeChain}-${id}`)) ?? [];
      const importedTokens: Token[] =
        (await localForage.getItem(`imported-tokens-${activeChain}`)) ?? [];
      setImportedTokens(activeChain, importedTokens || []);
      setActivatedTokens(activeChain, id, activatedTokens || []);
      setTokenBalances(activeChain, id, tokenBalances || []);
      setNodes(activeChain, id, nodesWallet || []);
      setTransactions(activeChain, id, txsWallet || []);
      setBalance(activeChain, id, balancesWallet.confirmed);
      setUnconfirmedBalance(activeChain, id, balancesWallet.unconfirmed);
      await localForage.setItem(`walletInUse-${activeChain}`, id);
      setWalletInUse(activeChain, id);
    })();
    openAction(false);
    navigate('/home');
  };

  const addWallet = () => {
    try {
      let path = '0-0';
      let i = 0;
      while (walletIds.includes(path)) {
        i++;
        path = '0-' + i;
      }
      if (i > 19) {
        displayMessage('error', t('home:navbar.max_wallets'));
        return;
      }
      generateAddress(path);
    } catch (error) {
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const removeLastWallet = () => {
    try {
      let path = '0-0';
      let i = 0;
      while (walletIds.includes(path)) {
        i++;
        path = '0-' + i;
      }
      const walletToRemoveIndex = i - 1;
      const pathToDelete = `0-${walletToRemoveIndex}`;
      if (walletToRemoveIndex <= 0) return;
      if (pathToDelete === walletInUse) {
        selectWallet('0-0');
      }
      removeWallet(activeChain, pathToDelete);
      void (async function () {
        await removeWalletName(activeChain, pathToDelete);
        const gw: generatedWallets =
          (await localForage.getItem(`wallets-${activeChain}`)) ?? {};
        delete gw[pathToDelete];
        await localForage.setItem(`wallets-${activeChain}`, gw);
      })();
    } catch (error) {
      console.log(error);
    }
  };

  const switchChain = (chain: keyof cryptos) => {
    if (chain === activeChain) {
      openAction(false);
      navigate('/home');
      return;
    }
    void (async function () {
      try {
        await switchToChain(chain, passwordBlob);
        openAction(false);
        navigate('/home');
      } catch (error) {
        console.log(error);
        displayMessage('error', t('home:chainSelect.unable_switch_chain'));
      }
    })();
  };

  const body = document.body;
  const isSidePanel = body.classList.contains('extension-sidepanel');

  return (
    <Drawer
      className="wallet-switcher"
      title={t('home:switcher.title', 'Wallets & networks')}
      placement={isSidePanel ? 'right' : 'bottom'}
      height={isSidePanel ? undefined : '82%'}
      width={isSidePanel ? 360 : undefined}
      open={open}
      onClose={() => openAction(false)}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('home:switcher.search', 'Search wallets or networks')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <div className="switcher-section-title">
        {blockchainConfig.name} {t('home:switcher.wallets', 'wallets')}
      </div>
      <div className="switcher-wallet-list" data-tutorial="wallet-list">
        {filteredWalletIds.map((id) => (
          <button
            key={id}
            type="button"
            className={`switcher-wallet${id === walletInUse ? ' switcher-wallet-active' : ''}`}
            onClick={() => selectWallet(id)}
          >
            <Identicon value={wallets[id]?.address || id} size={30} />
            <span className="switcher-wallet-meta">
              <span className="switcher-wallet-name">
                <WalletName
                  walletId={id}
                  chain={activeChain}
                  editable={false}
                />
              </span>
              <span className="switcher-wallet-crypto">{walletCrypto(id)}</span>
            </span>
            <span className="switcher-wallet-right">
              <span className="switcher-wallet-fiat">{walletFiat(id)}</span>
              {id === walletInUse && (
                <CheckOutlined className="switcher-wallet-check" />
              )}
            </span>
          </button>
        ))}
      </div>

      {!query && (
        <div className="switcher-wallet-actions">
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={addWallet}
            disabled={walletIds.length >= 20}
            data-tutorial="add-wallet-button"
          >
            {t('home:navbar.generate_new_wallet')}
          </Button>
          {walletIds.length > 1 && (
            <Popconfirm
              title={t('home:navbar.remove_last_wallet')}
              description={<>{t('home:navbar.remove_last_wallet_desc')}</>}
              okText={t('home:navbar.remove')}
              cancelText={t('common:cancel')}
              onConfirm={removeLastWallet}
              icon={<QuestionCircleOutlined style={{ color: '#f59e0b' }} />}
            >
              <Button
                type="text"
                icon={<MinusOutlined />}
                data-tutorial="remove-wallet-button"
              >
                {t('home:navbar.remove_last_wallet')}
              </Button>
            </Popconfirm>
          )}
        </div>
      )}

      <Divider style={{ margin: '12px 0' }} />

      <div className="switcher-section-title" data-tutorial="chain-selector">
        {t('home:switcher.networks', 'Networks')}
      </div>
      <div className="switcher-chain-list" data-tutorial="chain-list">
        {filteredChains.map((chain) => (
          <button
            key={chain}
            type="button"
            className={`switcher-chain${chain === activeChain ? ' switcher-chain-active' : ''}`}
            onClick={() => switchChain(chain)}
            data-tutorial={chain === 'eth' ? 'chain-item-eth' : undefined}
          >
            <Image
              height={24}
              width={24}
              preview={false}
              src={blockchains[chain].logo}
            />
            <span className="switcher-chain-name">
              {blockchains[chain].name}
            </span>
            {chain === activeChain && (
              <CheckOutlined className="switcher-wallet-check" />
            )}
          </button>
        ))}
      </div>
    </Drawer>
  );
}

export default WalletSwitcher;
