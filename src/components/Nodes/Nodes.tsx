import { useEffect, useRef } from 'react';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import { setNodes } from '../../store';
import NodesTable from './NodesTable.tsx';
import { node } from '../../types';
import {
  fetchNodesUtxos,
  getNodesOnNetwork,
  fetchDOSFlux,
  fetchStartFlux,
} from '../../lib/nodes.ts';

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
      fetchUtxosForNodes();
    })();
  };

  const fetchUtxosForNodes = () => {
    const wInUse = walletInUse;
    fetchNodesUtxos(wallets[wInUse].address, activeChain)
      .then(async (utxos) => {
        // for our utxo list fetch information from explorer. INSIGHT
        const confirmedNodes = await getNodesOnNetwork(
          wallets[wInUse].address,
          activeChain,
        );
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
        let fetchDOSandStart = false;
        nodes.forEach((node) => {
          const confirmedNode = confirmedNodes.find(
            (n) => n.txhash === node.txid && +n.outidx === +node.vout,
          );
          if (confirmedNode) {
            node.ip = confirmedNode.ip;
            node.status = 'Confirmed';
          }
          if (!confirmedNode) {
            fetchDOSandStart = true;
          }
        });
        if (fetchDOSandStart) {
          const dosNodes = await fetchDOSFlux();
          const startedNodes = await fetchStartFlux();
          nodes.forEach((node) => {
            const dosNode = dosNodes.find(
              (n) => n.collateral === `COutPoint(${node.txid}, ${node.vout})`,
            );
            if (dosNode) {
              node.status = 'DoS';
            }
            const startedNode = startedNodes.find(
              (n) => n.collateral === `COutPoint(${node.txid}, ${node.vout})`,
            );
            if (startedNode) {
              node.status = 'Started';
            }
          });
        }
        nodes.forEach((node) => {
          if (!node.status) {
            node.status === 'Offline'; // no status means offline
          }
          if (node.status.startsWith('1')) {
            // timestamp this means it got recently started. Status is Starting
            // we recently started this node and its not in any list yet.
            // check if timestamp is older than 20 minutes (blocktime is 2 minutes)
            const now = new Date().getTime();
            const startedAt = new Date(node.status).getTime();
            if (now - startedAt > 20 * 60 * 1000) {
              node.status = 'Offline'; // timestamp
            }
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
      <NodesTable nodes={myNodes} chain={activeChain} refresh={refreshNodes} />
    </div>
  );
}

export default Transactions;
