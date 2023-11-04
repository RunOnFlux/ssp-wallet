import { useEffect, useRef } from 'react';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import { setNodes } from '../../store';
import NodesTable from './NodesTable.tsx';
import { node } from '../../types';
import { fetchUtxos } from '../../lib/constructTx.ts';

function Transactions() {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const isInitialMount = useRef(true);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const myNodes = wallets[walletInUse].nodes ?? [];

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
  });

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    refreshNodes();
  }, [walletInUse, activeChain]);

  const refreshNodes = () => {
    void (async function () {
      const wInUse = walletInUse;
      const txsWallet: node[] =
        (await localForage.getItem(`nodes-${activeChain}-${wInUse}`)) ?? [];
      if (txsWallet) {
        setNodes(activeChain, wInUse, txsWallet);
      }
      fetchAddrUtxos();
    })();
  };

  const fetchAddrUtxos = () => {
    console.log('kappa');
    const wInUse = walletInUse;
    fetchUtxos(wallets[wInUse].address, activeChain)
      .then(async (utxos) => {
        const nodes: node[] = [...myNodes];
        utxos.forEach((utxo) => {
          const nodeExists = myNodes.find(
            (n) => n.txid === utxo.txid && n.vout === utxo.vout,
          );
          if (!nodeExists) {
            const node: node = {
              txid: utxo.txid,
              vout: utxo.vout,
              amount: utxo.satoshis,
              name: '', // nodes without name are unassigned and can be used in txs
              ip: '',
              status: '',
            };
            nodes.push(node);
          }
        });
        setNodes(activeChain, wInUse, nodes || []);
        await localForage.setItem(`nodes-${activeChain}-${wInUse}`, nodes);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  return (
    <div>
      <NodesTable nodes={myNodes} chain={activeChain} refresh={refreshNodes}/>
    </div>
  );
}

export default Transactions;
