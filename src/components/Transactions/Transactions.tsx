import { useEffect, useRef, useState } from 'react';
import localForage from 'localforage';
import axios from 'axios';
import { sspConfig } from '@storage/ssp';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setTransactions, setBlockheight } from '../../store';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { getBlockheight } from '../../lib/blockheight.ts';
import TransactionsTable from './TransactionsTable.tsx';
import PendingTransactionsTable from './PendingTransactionsTable.tsx';
import SocketListener from '../SocketListener/SocketListener.tsx';
import { decodeTransactionForApproval } from '../../lib/transactions.ts';
import { actionSSPRelay, pendingTransaction, transaction } from '../../types';

let refreshInterval: string | number | NodeJS.Timeout | undefined;

function Transactions() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const isInitialMount = useRef(true);
  const dispatch = useAppDispatch();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse, blockheight, sspWalletKeyIdentity } =
    useAppSelector((state) => state[activeChain]);
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const [pendingTxs, setPendingTxs] = useState<pendingTransaction[]>([]);
  const [fiatRate, setFiatRate] = useState(0);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    getCryptoRate(activeChain, 'USD');
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      getTransactions();
      getCryptoRate(activeChain, 'USD');
    }, 20000);
  });

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
        dispatch(setTransactions({ wallet: wInUse, data: txsWallet })) ?? [];
      }
      getTransactions();
    })();
  }, [walletInUse]);

  const getTransactions = () => {
    fetchTransactions();
    fetchBlockheight();
  };

  const fetchTransactions = () => {
    const wInUse = walletInUse;
    fetchAddressTransactions(wallets[wInUse].address, activeChain, 0, 10)
      .then(async (txs) => {
        dispatch(setTransactions({ wallet: wInUse, data: txs }));
        await localForage.setItem(`transactions-${activeChain}-${wInUse}`, txs);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  const fetchBlockheight = () => {
    getBlockheight(activeChain)
      .then(async (height) => {
        dispatch(setBlockheight(height));
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
        `https://${sspConfig().relay}/v1/action/${sspWalletKeyIdentity}`,
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
    const cr = cryptoRates[crypto];
    const fi = fiatRates[fiat];
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
    <>
      <PendingTransactionsTable
        transactions={pendingTxs}
        fiatRate={fiatRate}
        refresh={getPendingTx}
      />

      <TransactionsTable
        transactions={wallets[walletInUse]?.transactions ?? []}
        blockheight={blockheight}
        fiatRate={fiatRate}
        refresh={getTransactions}
        chain={activeChain}
      />

      <SocketListener txRejected={onTxRejected} txSent={onTxSent} />
    </>
  );
}

export default Transactions;
