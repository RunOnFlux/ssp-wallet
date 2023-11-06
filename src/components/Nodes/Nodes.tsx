import { useEffect, useRef, useState } from 'react';
import secureLocalStorage from 'react-secure-storage';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import { setNodes } from '../../store';
import NodesTable from './NodesTable.tsx';
import { node } from '../../types';
import { getFingerprint } from '../../lib/fingerprint';
import {
  fetchNodesUtxos,
  getNodesOnNetwork,
  fetchDOSFlux,
  fetchStartFlux,
} from '../../lib/nodes.ts';
import {
  generateNodeIdentityKeypair,
  generateAddressKeypair,
  getScriptType,
} from '../../lib/wallet.ts';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';

function Nodes() {
  const { t } = useTranslation(['home', 'common']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const isInitialMount = useRef(true);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const redeemScript = wallets[walletInUse].redeemScript;
  const blockchainConfig = blockchains[activeChain];
  const myNodes = wallets[walletInUse].nodes ?? [];
  const [nodeIdentityPK, setNodeIdentityPK] = useState(''); // we show node identity private key!
  const [collateralPrivKey, setCollateralPrivKey] = useState(''); // we show node identity private key!

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    void generateIdentity();
  });

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    void generateIdentity();
    refreshNodes();
  }, [walletInUse, activeChain]);

  const refreshNodes = () => {
    void (async function () {
      const wInUse = walletInUse;
      const nodesWallet: node[] =
        (await localForage.getItem(`nodes-${activeChain}-${wInUse}`)) ?? [];
      if (nodesWallet) {
        setNodes(activeChain, wInUse, nodesWallet);
      }
      fetchUtxosForNodes();
    })();
  };

  const generateIdentity = async () => {
    try {
      const xprivEncrypted = secureLocalStorage.getItem(
        `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
          blockchainConfig.scriptType,
        )}`,
      );
      const fingerprint: string = getFingerprint();
      const password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Unable to decrypt password');
      }
      if (xprivEncrypted && typeof xprivEncrypted === 'string') {
        const xpriv = await passworderDecrypt(password, xprivEncrypted);
        if (xpriv && typeof xpriv === 'string') {
          const splittedDerPath = walletInUse.split('-');
          const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
          const addressIndex = Number(splittedDerPath[1]);
          const generatedNodeKeypair = generateNodeIdentityKeypair(
            xpriv,
            12,
            addressIndex,
            activeChain,
          );
          setNodeIdentityPK(generatedNodeKeypair.privKey); // is comprossed. Zelcore is using uncompressed.
          const keyPair = generateAddressKeypair(
            xpriv,
            typeIndex,
            addressIndex,
            activeChain,
          );
          setCollateralPrivKey(keyPair.privKey);
        } else {
          throw new Error('Unable to decrypt xpriv');
        }
      }
    } catch (error) {
      console.log('Unable to generate node identity');
    }
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
            node.status = t('home:nodesTable.confirmed');
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
              node.status = t('home:nodesTable.dos');
            }
            const startedNode = startedNodes.find(
              (n) => n.collateral === `COutPoint(${node.txid}, ${node.vout})`,
            );
            if (startedNode) {
              node.status = t('home:nodesTable.started');
            }
          });
        }
        nodes.forEach((node) => {
          if (!node.status) {
            node.status === t('home:nodesTable.offline'); // no status means offline
          }
          if (node.status.startsWith('1')) {
            // timestamp this means it got recently started. Status is Starting
            // we recently started this node and its not in any list yet.
            // check if timestamp is older than 20 minutes (blocktime is 2 minutes)
            const now = new Date().getTime();
            const startedAt = new Date(node.status).getTime();
            if (now - startedAt > 20 * 60 * 1000) {
              node.status = t('home:nodesTable.offline'); // timestamp
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
      <NodesTable
        nodes={myNodes}
        chain={activeChain}
        refresh={refreshNodes}
        identityPK={nodeIdentityPK}
        redeemScript={redeemScript}
        collateralPK={collateralPrivKey}
        walletInUse={walletInUse}
      />
    </div>
  );
}

export default Nodes;
