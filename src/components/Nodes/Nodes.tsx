import { useEffect, useState } from 'react';
import { message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import secureLocalStorage from 'react-secure-storage';
import { blockchains } from '@storage/blockchains';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import { setNodes } from '../../store';
import NodesTable from './NodesTable.tsx';
import NodesActions from './NodesActions.tsx';
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
import PArewards from './PArewards.tsx';

function Nodes() {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const { sspWalletExternalIdentity: sspwid } = useAppSelector(
    (state) => state.sspState,
  );
  const { identityChain } = useAppSelector((state) => state.sspState);
  const redeemScript = wallets[walletInUse].redeemScript;
  const address = wallets[walletInUse].address;
  const blockchainConfig = blockchains[activeChain];
  const myNodes = wallets[walletInUse].nodes ?? [];
  const [nodeIdentityPK, setNodeIdentityPK] = useState('');
  const [collateralPrivKey, setCollateralPrivKey] = useState('');
  const [collateralPublicKey, setCollateralPublicKey] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    return () => {
      // reset state
      setNodeIdentityPK('');
      setCollateralPrivKey('');
      setCollateralPublicKey('');
      console.log('reset state');
    };
  }, []); // Empty dependency array ensures this effect runs only on mount/unmount

  useEffect(() => {
    // Generate identity and refresh nodes when wallet or chain changes
    void generateIdentity();
    refreshNodes();

    // Clear any existing interval
    if (globalThis.refreshIntervalNodes) {
      clearInterval(globalThis.refreshIntervalNodes);
    }

    // Set up new interval if nodes exist
    if (wallets?.[walletInUse]?.nodes) {
      globalThis.refreshIntervalNodes = setInterval(() => {
        refreshNodes();
      }, 45000);
    }

    // Cleanup function - runs on unmount and before next effect
    return () => {
      if (globalThis.refreshIntervalNodes) {
        clearInterval(globalThis.refreshIntervalNodes);
      }
    };
  }, [walletInUse, activeChain]);

  const refreshNodes = () => {
    void (async function () {
      const wInUse = walletInUse;
      const nodesWallet: node[] =
        (await localForage.getItem(`nodes-${activeChain}-${wInUse}`)) ?? [];
      if (nodesWallet) {
        setNodes(activeChain, wInUse, nodesWallet);
      }
      fetchUtxosForNodes(nodesWallet || myNodes);
    })();
  };

  const generateIdentity = async () => {
    try {
      const xprivEncrypted = secureLocalStorage.getItem(
        `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
          blockchainConfig.scriptType,
        )}-${blockchainConfig.id}`,
      );
      const fingerprint: string = getFingerprint();
      let password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Unable to decrypt password');
      }
      if (xprivEncrypted && typeof xprivEncrypted === 'string') {
        let xpriv = await passworderDecrypt(password, xprivEncrypted);
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
          // reassign xpriv to null as it is no longer needed
          xpriv = null;
          password = null;
          setCollateralPublicKey(keyPair.pubKey);
          setCollateralPrivKey(keyPair.privKey);
        } else {
          throw new Error('Unable to decrypt xpriv');
        }
      }
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:nodesTable.err_unable_identity'));
    }
  };

  const fetchUtxosForNodes = (suppliedNodes: node[]) => {
    const wInUse = walletInUse;
    fetchNodesUtxos(address, activeChain)
      .then(async (utxos) => {
        // for our utxo list fetch information from explorer. INSIGHT
        const confirmedNodes = await getNodesOnNetwork(address, activeChain);
        const nodes: node[] = JSON.parse(
          JSON.stringify(suppliedNodes),
        ) as node[];
        utxos.forEach((utxo) => {
          const nodeExists = nodes.find(
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
        // here loop to remove already spent utxos
        nodes.forEach((node) => {
          const utxoExists = utxos.find(
            (utxo) => utxo.txid === node.txid && utxo.vout === node.vout,
          );
          if (!utxoExists) {
            const index = nodes.findIndex(
              (n) => n.txid === node.txid && n.vout === node.vout,
            );
            if (!node.name) {
              nodes.splice(index, 1);
            }
          }
        });
        let fetchDOSandStart = false;
        nodes.forEach((node) => {
          const confirmedNode = confirmedNodes.find(
            (n) => n.txhash === node.txid && +n.outidx === +node.vout,
          );
          if (confirmedNode) {
            node.ip = confirmedNode.ip;
            node.status = 'confirmed';
          } else if (
            node.status === 'confirmed' ||
            node.status === t('home:nodesTable.confirmed') // backwards compatibility, can be removed after a while
          ) {
            node.status = 'offline';
          }
          if (!confirmedNode) {
            fetchDOSandStart = true;
          }
        });
        if (fetchDOSandStart) {
          const dosNodes = await fetchDOSFlux(activeChain);
          const startedNodes = await fetchStartFlux(activeChain);
          nodes.forEach((node) => {
            const dosNode = dosNodes.find(
              (n) => n.collateral === `COutPoint(${node.txid}, ${node.vout})`,
            );
            if (dosNode) {
              node.status = 'dos';
            } else if (
              node.status === 'dos' ||
              node.status === t('home:nodesTable.dos') // backwards compatibility, can be removed after a while
            ) {
              node.status = 'offline';
            }
            const startedNode = startedNodes.find(
              (n) => n.collateral === `COutPoint(${node.txid}, ${node.vout})`,
            );
            if (startedNode) {
              node.status = 'started';
            } else if (
              node.status === 'started' ||
              node.status === t('home:nodesTable.started') // backwards compatibility, can be removed after a while
            ) {
              node.status = 'offline';
            }
          });
        }
        console.log(nodes);
        nodes.forEach((node) => {
          if (!node.status) {
            node.status = 'offline'; // no status means offline
          }
          if (node.status.startsWith('1')) {
            // timestamp this means it got recently started. Status is Starting
            // we recently started this node and its not in any list yet.
            // check if timestamp is older than 20 minutes (blocktime is 2 minutes)
            const now = new Date().getTime();
            const startedAt = new Date(+node.status * 1000).getTime();
            if (now - startedAt > 20 * 60 * 1000) {
              node.status = 'offline'; // timestamp
            }
          }
        });
        console.log(nodes);
        setNodes(activeChain, wInUse, nodes || []);
        await localForage.setItem(`nodes-${activeChain}-${wInUse}`, nodes);
      })
      .catch((error) => {
        console.log(error);
      });
  };
  return (
    <div>
      {contextHolder}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <PArewards
          redeemScript={redeemScript}
          collateralPrivKey={collateralPrivKey}
          collateralPubKey={collateralPublicKey}
          sspwid={sspwid}
        />
        <NodesActions
          nodes={myNodes}
          chain={activeChain}
          walletInUse={walletInUse}
          collateralPK={collateralPrivKey}
          identityPK={nodeIdentityPK}
          redeemScript={redeemScript}
        />
      </div>
      <NodesTable
        nodes={myNodes}
        chain={activeChain}
        refresh={refreshNodes}
        identityPK={nodeIdentityPK}
        redeemScript={redeemScript}
        collateralPK={collateralPrivKey}
        walletInUse={walletInUse}
        sspwid={sspwid}
        identityChain={identityChain}
        passwordBlob={passwordBlob}
      />
    </div>
  );
}

export default Nodes;
