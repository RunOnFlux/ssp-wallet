import { useEffect, useRef, useState } from 'react';
import localForage from 'localforage';
import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { useAppSelector } from '../../hooks';
import { setTransactions, setBlockheight } from '../../store';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { getBlockheight } from '../../lib/blockheight.ts';
import TransactionsTable from './TransactionsTable.tsx';
import PendingTransactionsTable from './PendingTransactionsTable.tsx';
import SocketListener from '../SocketListener/SocketListener.tsx';
import { decodeTransactionForApproval } from '../../lib/transactions.ts';
import { actionSSPRelay, pendingTransaction, transaction } from '../../types';

function Transactions() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const isInitialMount = useRef(true);
  const { sspWalletKeyInternalIdentity, activeChain } = useAppSelector(
    (state) => state.sspState,
  );
  const { wallets, walletInUse, blockheight } = useAppSelector(
    (state) => state[activeChain],
  );
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const [pendingTxs, setPendingTxs] = useState<pendingTransaction[]>([]);
  const [fiatRate, setFiatRate] = useState(0);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    setPendingTxs([]);
    getPendingTx();
    void (async function () {
      const wInUse = walletInUse;
      const txsWallet: transaction[] =
        (await localForage.getItem(`transactions-${activeChain}-${wInUse}`)) ??
        [];
      if (txsWallet) {
        setTransactions(activeChain, wInUse, txsWallet);
      }
      getTransactions();
    })();
    getCryptoRate(activeChain, sspConfig().fiatCurrency);
    if (globalThis.refreshIntervalTransactions) {
      clearInterval(globalThis.refreshIntervalTransactions);
    }
    globalThis.refreshIntervalTransactions = setInterval(() => {
      getTransactions();
      getCryptoRate(activeChain, sspConfig().fiatCurrency);
    }, 20000);
  });

  useEffect(() => {
    getCryptoRate(activeChain, sspConfig().fiatCurrency);
  }, [cryptoRates, fiatRates]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setPendingTxs([]);
    getPendingTx();
    void (async function () {
      const wInUse = walletInUse;
      const txsWallet: transaction[] =
        (await localForage.getItem(`transactions-${activeChain}-${wInUse}`)) ??
        [];
      if (txsWallet) {
        setTransactions(activeChain, wInUse, txsWallet);
      }
      getTransactions();
    })();
    if (globalThis.refreshIntervalTransactions) {
      clearInterval(globalThis.refreshIntervalTransactions);
    }
    globalThis.refreshIntervalTransactions = setInterval(() => {
      getTransactions();
      getCryptoRate(activeChain, sspConfig().fiatCurrency);
    }, 20000);
  }, [walletInUse, activeChain, wallets[walletInUse].address]);

  const getTransactions = () => {
    fetchTransactions();
    fetchBlockheight();
  };

  const fetchTransactions = () => {
    const wInUse = walletInUse;
    fetchAddressTransactions(wallets[wInUse].address, activeChain, 0, 10, 1)
      .then(async (txs) => {
        setTransactions(activeChain, wInUse, txs || []);
        await localForage.setItem(`transactions-${activeChain}-${wInUse}`, txs);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  const fetchBlockheight = () => {
    getBlockheight(activeChain)
      .then(async (height) => {
        setBlockheight(activeChain, height ?? 0);
        await localForage.setItem(`blockheight-${activeChain}`, height);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const getPendingTx = () => {
    const wInUse = walletInUse;
    axios
      .get<actionSSPRelay>(
        `https://${sspConfig().relay}/v1/action/${sspWalletKeyInternalIdentity}`,
      )
      .then((res) => {
        if (res.data.action === 'tx') {
          const decoded = decodeTransactionForApproval(
            res.data.payload,
            activeChain,
          );
          if (decoded.sender !== wallets[wInUse].address) {
            setPendingTxs([]);
          } else {
            setPendingTxs([{ ...decoded, ...res.data }]);
          }
        } else {
          setPendingTxs([]);
        }
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    const cr = cryptoRates[crypto] ?? 0;
    const fi = fiatRates[fiat] ?? 0;
    setFiatRate(cr * fi);
  };

  const onTxRejected = () => {
    getPendingTx();
  };

  const onTxSent = () => {
    getPendingTx();
    setTimeout(() => {
      getTransactions();
    }, 2500);
  };

  return (
    <div>
      <PendingTransactionsTable
        transactions={pendingTxs}
        fiatRate={fiatRate}
        refresh={getPendingTx}
      />

      <TransactionsTable
        transactions={wallets[walletInUse]?.transactions ?? []}
        blockheight={blockheight}
        fiatRate={fiatRate}
        address={wallets[walletInUse].address ?? ''}
        chain={activeChain}
        refresh={getTransactions}
      />

      <SocketListener
        txRejected={onTxRejected}
        txSent={onTxSent}
        ignorePopups={true}
      />
    </div>
  );
}

export default Transactions;
