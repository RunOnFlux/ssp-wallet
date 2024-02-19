import { useEffect, useRef, useState } from 'react';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import { setBalance, setUnconfirmedBalance } from '../../store';
import { fetchAddressBalance } from '../../lib/balances.ts';
import SocketListener from '../SocketListener/SocketListener.tsx';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';

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
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const isInitialMount = useRef(true);
  const [fiatRate, setFiatRate] = useState(0);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const myNodes = wallets[walletInUse].nodes ?? [];
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
  const [balanceUSD, setBalanceUSD] = useState(
    totalBalance.multipliedBy(new BigNumber(fiatRate)),
  );

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
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
  });

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    refresh();
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
    })();
    if (globalThis.refreshIntervalBalances) {
      clearInterval(globalThis.refreshIntervalBalances);
    }
    globalThis.refreshIntervalBalances = setInterval(() => {
      refresh();
    }, 20000);
  }, [walletInUse, activeChain, wallets[walletInUse].address]);

  useEffect(() => {
    getCryptoRate(activeChain, 'USD');
  }, [cryptoRates, fiatRates]);

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
  };

  useEffect(() => {
    const ttlBal = new BigNumber(wallets[walletInUse].balance)
      .plus(new BigNumber(wallets[walletInUse].unconfirmedBalance))
      .dividedBy(10 ** blockchainConfig.decimals);
    setTotalBalance(ttlBal);
    const balUSD = ttlBal.multipliedBy(new BigNumber(fiatRate));
    setBalanceUSD(balUSD);
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
    getCryptoRate(activeChain, 'USD');
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
      <h3 style={{ marginTop: 0, marginBottom: 0 }}>
        {totalBalance.toFixed() || '0.00'} {blockchainConfig.symbol}
      </h3>
      {+lockedBalance > 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'grey',
          }}
        >
          {t('home:balances.locked', {
            balance: lockedBalance.toFixed() || '0.00',
            symbol: blockchainConfig.symbol,
          })}
        </div>
      )}
      <h4 style={{ marginTop: 10, marginBottom: 15 }}>
        {t('home:balances.fiat_value', {
          fiatSymbol: '$',
          fiatValue: balanceUSD.toFixed(2) || '0.00',
          fiatCurrency: 'USD',
        })}
      </h4>
      <SocketListener txRejected={onTxRejected} txSent={onTxSent} />
    </>
  );
}

export default Balances;
