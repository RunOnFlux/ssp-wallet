import { useEffect, useState } from 'react';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import {
  setBalance,
  setUnconfirmedBalance,
  setTokenBalances,
} from '../../store';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances.ts';
import SocketListener from '../SocketListener/SocketListener.tsx';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';
import { usePrivacyMode } from '../../contexts/PrivacyContext';

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject = {
  confirmed: '0.00',
  unconfirmed: '0.00',
};

function Balances() {
  const { t } = useTranslation(['home']);
  const { hidden, togglePrivacy } = usePrivacyMode();
  const [fiatRate, setFiatRate] = useState(0);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const walletAddress = wallets[walletInUse]?.address;
  const myNodes = wallets[walletInUse].nodes || [];
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const blockchainConfig = blockchains[activeChain];
  const [totalBalance, setTotalBalance] = useState(
    new BigNumber(wallets[walletInUse].balance)
      .plus(new BigNumber(wallets[walletInUse].unconfirmedBalance))
      .dividedBy(10 ** blockchainConfig.decimals),
  );
  const [lockedBalance, setLockedBalance] = useState(
    myNodes.reduce((acc, node) => {
      return acc.plus(
        new BigNumber(node.name ? node.amount : 0).dividedBy(
          10 ** blockchainConfig.decimals,
        ),
      );
    }, new BigNumber(0)),
  );
  const [balanceFIAT, setBalanceFIAT] = useState(
    totalBalance.multipliedBy(new BigNumber(fiatRate)),
  );

  useEffect(() => {
    if (!walletAddress) return;
    void (async function () {
      const wInUse = walletInUse;
      const chInUse = activeChain;
      const balancesWallet: balancesObj =
        (await localForage.getItem(`balances-${chInUse}-${wInUse}`)) ??
        balancesObject;
      if (balancesWallet) {
        setBalance(chInUse, wInUse, balancesWallet.confirmed);
        setUnconfirmedBalance(chInUse, wInUse, balancesWallet.unconfirmed);
      }
      refresh();
    })();
    if (globalThis.refreshIntervalBalances) {
      clearInterval(globalThis.refreshIntervalBalances);
    }
    globalThis.refreshIntervalBalances = setInterval(() => {
      refresh();
    }, 20000);
    // Home unmounts when switching tabs (Portfolio/Activity/Settings) — the
    // poller must not keep firing after unmount. Login still clears the global
    // on logout; this only adds the component-level cleanup.
    return () => {
      if (globalThis.refreshIntervalBalances) {
        clearInterval(globalThis.refreshIntervalBalances);
        globalThis.refreshIntervalBalances = undefined;
      }
    };
  }, [activeChain, walletInUse, walletAddress]);

  useEffect(() => {
    getCryptoRate(activeChain, sspConfig().fiatCurrency);
  }, [activeChain, cryptoRates, fiatRates]);

  const fetchBalance = () => {
    const chainFetched = activeChain;
    const walletFetched = walletInUse;
    fetchAddressBalance(wallets[walletFetched].address, chainFetched)
      .then(async (balance) => {
        setBalance(chainFetched, walletFetched, balance.confirmed);
        setUnconfirmedBalance(chainFetched, walletFetched, balance.unconfirmed);
        await localForage.setItem(
          `balances-${chainFetched}-${walletFetched}`,
          balance,
        );
      })
      .catch((error) => {
        console.log(error);
      });
    // Fetch token balances for chains that support tokens (EVM + Solana SPL).
    if (
      blockchains[chainFetched].chainType === 'evm' ||
      blockchains[chainFetched].chainType === 'sol'
    ) {
      // create contracts array from tokens contracts in specs
      fetchAddressTokenBalances(
        wallets[walletFetched].address,
        chainFetched,
        wallets[walletInUse].activatedTokens || [], // fetch for activated tokens only
      )
        .then(async (balancesTokens) => {
          console.log(balancesTokens);
          setTokenBalances(chainFetched, walletFetched, balancesTokens);
          await localForage.setItem(
            `token-balances-${chainFetched}-${walletFetched}`,
            balancesTokens,
          );
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  useEffect(() => {
    const ttlBal = new BigNumber(wallets[walletInUse].balance)
      .plus(new BigNumber(wallets[walletInUse].unconfirmedBalance))
      .dividedBy(10 ** blockchainConfig.decimals);
    setTotalBalance(ttlBal);
    const balFIAT = ttlBal.multipliedBy(new BigNumber(fiatRate));
    setBalanceFIAT(balFIAT);
    const lockedAmnt = myNodes.reduce((acc, node) => {
      return acc.plus(
        new BigNumber(node.name ? node.amount : 0).dividedBy(
          10 ** blockchainConfig.decimals,
        ),
      );
    }, new BigNumber(0));
    setLockedBalance(lockedAmnt);
  }, [fiatRate, wallets, walletInUse, activeChain]);

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    const cr = cryptoRates[crypto] ?? 0;
    const fi = fiatRates[fiat] ?? 0;
    setFiatRate(cr * fi);
  };

  const refresh = () => {
    fetchBalance();
    getCryptoRate(activeChain, sspConfig().fiatCurrency);
  };

  const onTxRejected = () => {
    // do nothing
  };

  const onTxSent = () => {
    setTimeout(() => {
      refresh();
    }, 2500);
    setTimeout(() => {
      refresh();
    }, 7500);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        title={hidden ? t('home:balances.show') : t('home:balances.hide')}
        aria-pressed={hidden}
        style={{ cursor: 'pointer' }}
        onClick={togglePrivacy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            togglePrivacy();
          }
        }}
      >
        {/* Hero balance digits align in tabular figures (DESIGN_TOKENS §3) */}
        <h3
          style={{
            marginTop: 0,
            marginBottom: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
          data-tutorial="balance-overview"
        >
          <span className="privacy-sensitive">
            {formatCrypto(totalBalance)} {blockchainConfig.symbol}
          </span>
        </h3>
        {+lockedBalance > 0 && (
          <div
            style={{
              fontSize: 12,
              opacity: 0.65 /* theme-aware secondary — no hardcoded grey */,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span className="privacy-sensitive">
              {t('home:balances.locked', {
                balance: formatCrypto(lockedBalance),
                symbol: blockchainConfig.symbol,
              })}
            </span>
          </div>
        )}
        <h4
          style={{
            marginTop: 10,
            marginBottom: 15,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span className="privacy-sensitive">
            {formatFiatWithSymbol(balanceFIAT)}
          </span>
        </h4>
      </div>
      <SocketListener txRejectedProp={onTxRejected} txSentProp={onTxSent} />
    </>
  );
}

export default Balances;
