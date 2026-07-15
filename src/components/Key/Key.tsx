import { useState, useEffect, useRef } from 'react';
import { toast } from '../../lib/toast';
import { useSspLogo } from '../../hooks/useSspLogo';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';
import {
  Modal,
  QRCode,
  Button,
  Input,
  Space,
  Typography,
  Tabs,
  Steps,
  Alert,
  Tag,
  theme,
} from 'antd';
const { Paragraph, Text } = Typography;
import { NoticeType } from 'antd/es/message/interface';
import secureLocalStorage from 'react-secure-storage';
import axios from 'axios';

import './Key.css';

import {
  decrypt as passworderDecrypt,
  encrypt as passworderEncrypt,
} from '@metamask/browser-passworder';
import { getFingerprint } from '../../lib/fingerprint';
import { generateMultisigAddress, getScriptType } from '../../lib/wallet.ts';
import {
  sessionVerificationWords,
  verificationQrValue,
  VERIFY_ACCENTS,
  type VerifyEntry,
} from '../../lib/pairingVerification';
import { replenishWalletEnterpriseNonces } from '../../lib/enterpriseNonces';
import {
  buildChainSyncRequestPayload,
  fetchChainSyncRejection,
  verifyBatchSyncDoc,
  ensureWalletChainKeys,
  storeKeyXpubForChain,
  shouldShowQrFallback,
  isBatchStalled,
} from '../../lib/chainSync';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import type { syncSSPRelay, cryptos } from '../../types';
import { setXpubKey, setActiveChain, store } from '../../store';
import CreationSteps from '../../components/CreationSteps/CreationSteps.tsx';

import { sspConfig } from '@storage/ssp';

const { TextArea } = Input;
const { confirm } = Modal;

const xpubRegex = /^([a-zA-Z]{2}ub[1-9A-HJ-NP-Za-km-z]{79,140})$/; // xpub start is the most usual, but can also be Ltub

// Solana repurposes the "xpub" field as a JSON-stringified array of 20
// base58-encoded Ed25519 leaf pubkeys. Accept that format too in manual
// sync input.
function isSolanaPubkeyArrayString(input: string): boolean {
  try {
    const arr: unknown = JSON.parse(input.trim());
    if (!Array.isArray(arr) || arr.length !== 20) return false;
    const base58Pk = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    const seen = new Set<string>();
    for (const pk of arr) {
      if (typeof pk !== 'string' || !base58Pk.test(pk)) return false;
      // Each HD slot derives a distinct ed25519 leaf — duplicate entries
      // are either a wallet/key bug or a malformed paste. Reject so the
      // sync flow doesn't accept an array that would later break address
      // derivation (different addressIndex collapsing to the same pubkey
      // would dilute multisig threshold semantics for enterprise vaults
      // sharing this pubkey pool).
      if (seen.has(pk)) return false;
      seen.add(pk);
    }
    return true;
  } catch {
    return false;
  }
}

let pollingSyncInterval: string | number | NodeJS.Timeout | undefined;
let syncRunning = false;
let nonceReplenishRunning = false;

// Sensible default extra chains preselected during first (identity) pairing.
const POPULAR_CHAINS = ['eth', 'flux', 'polygon'];

type BatchPhase =
  | 'idle'
  | 'preparing'
  | 'awaiting'
  | 'syncing'
  | 'done'
  | 'rejected'
  | 'fallback';

interface BatchChainState {
  xpubWallet: string;
  // key's extended pubkey for this chain, captured on a verified sync doc.
  // Display-only — feeds the out-of-band verification code, never logged.
  keyXpub?: string;
  status: 'pending' | 'synced' | 'failed';
}

// Out-of-band verification gate shown before the vault is treated as ready.
// ONE code per session: covers every chain synced this session (identity chain
// + any batch/activated chains), aggregated so a relay swap on ANY of them
// changes the code. `qrValue` encodes the same code for scan-to-verify.
interface VerifyGate {
  chains: string[];
  words: string[];
  qrValue: string;
}

interface BatchState {
  phase: BatchPhase;
  chains: Record<string, BatchChainState>;
  wkIdentity: string;
  startedAt: number;
  lastProgressAt: number;
  receivedAny: boolean;
  pollTick: number;
  rejectionCheckRunning: boolean;
  docCheckRunning: boolean;
}

const initialBatchState = (): BatchState => ({
  phase: 'idle',
  chains: {},
  wkIdentity: '',
  startedAt: 0,
  lastProgressAt: 0,
  receivedAny: false,
  pollTick: 0,
  rejectionCheckRunning: false,
  docCheckRunning: false,
});

function Key(props: { synchronised: (status: boolean) => void }) {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { token } = theme.useToken();
  const { synchronised } = props;
  const [isModalKeyOpen, setIsModalKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyAutomaticInput, setKeyAutomaticInput] = useState('');
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');
  const [isSSPKeyDownloadOpen, setIsSSPKeyDownloadOpen] = useState(false);
  const [phoneDetected, setPhoneDetected] = useState(false);
  const [verified, setVerified] = useState(false);
  const [selectedChains, setSelectedChains] = useState<(keyof cryptos)[]>([]);
  // batch bookkeeping lives in a ref — it is read and written from interval
  // closures created once; the render mirror is bumped via setBatchRender
  const batchRef = useRef<BatchState>(initialBatchState());
  const [, setBatchRender] = useState(0);
  const selectedChainsRef = useRef<(keyof cryptos)[]>([]);
  const activeChainDoneRef = useRef(false);
  // Out-of-band pairing verification: the key's identity-chain xpub captured
  // at identity verification (drives the single-chain verification code), and
  // the gate state the user must confirm before the vault becomes usable.
  const identityKeyXpubRef = useRef('');
  const verifyOpenRef = useRef(false);
  const [verifyGate, setVerifyGate] = useState<VerifyGate | null>(null);
  const batchPollRef = useRef<NodeJS.Timeout | null>(null);
  const {
    sspWalletInternalIdentity,
    sspWalletKeyInternalIdentity,
    activeChain,
    identityChain,
  } = useAppSelector((state) => state.sspState);
  const dispatch = useAppDispatch();
  const { xpubKey, xpubWallet } = useAppSelector((state) => state[activeChain]);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { createWkIdentityAuth } = useRelayAuth();
  const blockchainConfig = blockchains[activeChain];
  const derivationPath = `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
    blockchainConfig.scriptType,
  )}-${blockchainConfig.id}`;
  const isIdentityChain = activeChain === identityChain;
  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };

  const refreshBatch = () => setBatchRender((value) => value + 1);

  useEffect(() => {
    selectedChainsRef.current = selectedChains;
  }, [selectedChains]);

  useEffect(() => {
    // check if we have 2-xpub-48-slip-0-ScriptType-coin
    if (!xpubKey) {
      // no xpubKey, show sync view of Key
      setIsModalKeyOpen(true);
      activeChainDoneRef.current = false;
      setPhoneDetected(false);
      setVerified(false);
      // default chain preselection: popular set on first (identity) pairing,
      // nothing extra when activating a single additional chain
      if (activeChain === identityChain) {
        setSelectedChains(
          POPULAR_CHAINS.filter(
            (chain) => chain in blockchains && chain !== identityChain,
          ) as (keyof cryptos)[],
        );
      } else {
        setSelectedChains([]);
      }
      // start polling
      checkSynced();
      if (pollingSyncInterval) {
        clearInterval(pollingSyncInterval);
      }
      pollingSyncInterval = setInterval(() => {
        checkSynced();
      }, 1000);
    }
  }, [xpubWallet, activeChain]);

  // For an ALREADY-PAIRED wallet activating an additional chain, request a
  // one-tap batch sync over the existing relay action transport right away.
  // The QR code stays visible below the status timeline the whole time —
  // scanning it is always a valid alternative path (and the only path for
  // old SSP Key versions, which never answer the batch request).
  useEffect(() => {
    if (
      isModalKeyOpen &&
      !isIdentityChain &&
      !xpubKey &&
      xpubWallet &&
      sspWalletKeyInternalIdentity &&
      batchRef.current.phase === 'idle'
    ) {
      // auto-request covers just the chain being activated — extra chips
      // selected by the user go out via the explicit re-send button
      // (selectedChains state may not be committed yet in this effect pass)
      void startBatch([activeChain], sspWalletKeyInternalIdentity);
    }
  }, [isModalKeyOpen, activeChain]);

  useEffect(() => {
    return () => {
      stopBatchPolling();
    };
  }, []);

  const stopBatchPolling = () => {
    if (batchPollRef.current) {
      clearInterval(batchPollRef.current);
      batchPollRef.current = null;
    }
  };

  const ensureBatchPolling = () => {
    if (batchPollRef.current) return;
    batchPollRef.current = setInterval(() => {
      void batchTick();
    }, 1000);
  };

  const startBatch = async (
    chains: (keyof cryptos)[],
    wkIdentity: string,
  ): Promise<void> => {
    const batch = batchRef.current;
    if (!chains.length || !wkIdentity || !passwordBlob) {
      return;
    }
    try {
      batch.phase = 'preparing';
      batch.wkIdentity = wkIdentity;
      refreshBatch();
      const entries: { chain: keyof cryptos; xpubWallet: string }[] = [];
      for (const chain of chains) {
        // wallet-side xpub for the chain (derived + persisted when missing —
        // same calls and storage keys as the existing chain switch flow)
        const chainXpubWallet =
          chain === activeChain && xpubWallet
            ? xpubWallet
            : await ensureWalletChainKeys(chain, passwordBlob);
        entries.push({ chain, xpubWallet: chainXpubWallet });
        // let the UI paint between potentially multi-second derivations
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      const data: Record<string, unknown> = {
        action: 'chainsyncrequest',
        payload: buildChainSyncRequestPayload(entries),
        chain: identityChain,
        path: '',
        wkIdentity,
      };
      // Add authentication if available (matches other wallet action posts;
      // the relay accepts unauthenticated posts for backward compatibility)
      try {
        const auth = await createWkIdentityAuth('action', wkIdentity, data);
        if (auth) {
          Object.assign(data, auth);
        }
      } catch {
        console.warn('[ChainSync] Auth not available, sending without it');
      }
      await axios.post(`https://${sspConfig().relay}/v1/action`, data);
      batch.chains = {};
      entries.forEach((entry) => {
        batch.chains[entry.chain] = {
          xpubWallet: entry.xpubWallet,
          status: 'pending',
        };
      });
      batch.phase = 'awaiting';
      batch.startedAt = Date.now();
      batch.lastProgressAt = Date.now();
      batch.receivedAny = false;
      batch.pollTick = 0;
      refreshBatch();
      ensureBatchPolling();
    } catch (error) {
      console.log('[ChainSync] Failed to send batch request:', error);
      batch.phase = 'fallback';
      refreshBatch();
    }
  };

  const batchTick = async () => {
    const batch = batchRef.current;
    if (batch.phase !== 'awaiting' && batch.phase !== 'syncing') {
      return;
    }
    batch.pollTick += 1;
    const now = Date.now();
    if (
      batch.phase === 'awaiting' &&
      shouldShowQrFallback(batch.startedAt, now, batch.receivedAny)
    ) {
      // old SSP Key (or unreachable phone): surface the per-chain QR path,
      // but KEEP polling — a slow approval still lands
      batch.phase = 'fallback';
      refreshBatch();
    }
    if (
      batch.phase === 'syncing' &&
      isBatchStalled(batch.lastProgressAt, now)
    ) {
      Object.values(batch.chains).forEach((chainState) => {
        if (chainState.status === 'pending') {
          chainState.status = 'failed';
        }
      });
      finalizeBatch();
      return;
    }
    // rejection check (every ~3s) — works against old relays too, action
    // storage/GET are generic over action types
    if (batch.pollTick % 3 === 0 && !batch.rejectionCheckRunning) {
      batch.rejectionCheckRunning = true;
      try {
        const rejection = await fetchChainSyncRejection(batch.wkIdentity);
        if (
          rejection &&
          (batchRef.current.phase === 'awaiting' ||
            batchRef.current.phase === 'fallback' ||
            batchRef.current.phase === 'syncing')
        ) {
          batchRef.current.phase = 'rejected';
          refreshBatch();
          stopBatchPolling();
          return;
        }
      } finally {
        batch.rejectionCheckRunning = false;
      }
    }
    // per-chain sync docs: while the classic 1s poll is active it hands
    // foreign-chain docs to handleBatchSyncDoc from checkSynced — only poll
    // here once that interval is gone (active chain finished first)
    if (!pollingSyncInterval && !batch.docCheckRunning) {
      batch.docCheckRunning = true;
      try {
        const res = await axios.get<syncSSPRelay>(
          `https://${sspConfig().relay}/v1/sync/${sspWalletInternalIdentity}`,
        );
        await handleBatchSyncDoc(res.data);
      } catch {
        // nothing pending — keep polling
      } finally {
        batch.docCheckRunning = false;
      }
    }
  };

  // A sync doc arrived for a chain other than the active one — verify it
  // (same address/script comparisons as the classic flow, see
  // lib/chainSync.ts verifyBatchSyncDoc) and store the key xpub for that
  // chain using the exact same storage writes as the manual/QR flow.
  const handleBatchSyncDoc = async (doc: syncSSPRelay) => {
    const batch = batchRef.current;
    const entry = batch.chains[doc.chain];
    if (!entry || entry.status !== 'pending') {
      return;
    }
    markBatchArrival();
    if (doc.chain === activeChain) {
      // active chain is verified + stored by the untouched checkSynced path
      return;
    }
    if (!passwordBlob) {
      return;
    }
    const verdict = verifyBatchSyncDoc(
      {
        chain: doc.chain,
        keyXpub: doc.keyXpub,
        wkIdentity: doc.wkIdentity,
        generatedAddress: doc.generatedAddress,
        walletXpub: doc.walletXpub,
        witnessScript: doc.witnessScript,
        redeemScript: doc.redeemScript,
      },
      entry.xpubWallet,
    );
    if (!verdict.valid) {
      console.error(`[ChainSync] ${doc.chain}: ${verdict.reason}`);
      entry.status = 'failed';
      displayMessage('error', t('home:key.err_sync_fail'));
    } else {
      try {
        await storeKeyXpubForChain(
          doc.chain as keyof cryptos,
          doc.keyXpub,
          passwordBlob,
        );
        entry.status = 'synced';
        // retain the key xpub (display-only) for the verification code
        entry.keyXpub = doc.keyXpub;
      } catch (error) {
        console.log(error);
        entry.status = 'failed';
      }
    }
    batch.lastProgressAt = Date.now();
    refreshBatch();
    checkBatchComplete();
  };

  const markBatchArrival = () => {
    const batch = batchRef.current;
    if (batch.phase === 'idle') {
      return;
    }
    if (batch.phase === 'awaiting' || batch.phase === 'fallback') {
      batch.phase = 'syncing';
    }
    batch.receivedAny = true;
    batch.lastProgressAt = Date.now();
    refreshBatch();
  };

  const markBatchChainSynced = (chain: keyof cryptos) => {
    const batch = batchRef.current;
    const entry = batch.chains[chain];
    if (entry && entry.status === 'pending') {
      entry.status = 'synced';
      batch.lastProgressAt = Date.now();
      refreshBatch();
    }
  };

  const checkBatchComplete = () => {
    const batch = batchRef.current;
    const states = Object.values(batch.chains);
    if (!states.length || states.some((state) => state.status === 'pending')) {
      return;
    }
    finalizeBatch();
  };

  const finalizeBatch = () => {
    const batch = batchRef.current;
    batch.phase = 'done';
    refreshBatch();
    stopBatchPolling();
    const failed = Object.values(batch.chains).filter(
      (state) => state.status === 'failed',
    ).length;
    if (failed > 0) {
      displayMessage('warning', t('home:key.batch_partial_failed'));
    }
    if (activeChainDoneRef.current) {
      completeSync();
    }
  };

  // batch is only worth waiting for when the key actually engaged with it
  const batchStillWorking = () => {
    const batch = batchRef.current;
    if (
      batch.phase !== 'awaiting' &&
      batch.phase !== 'syncing' &&
      batch.phase !== 'preparing'
    ) {
      return false;
    }
    if (batch.phase === 'awaiting' && !batch.receivedAny) {
      return false;
    }
    return Object.values(batch.chains).some(
      (state) => state.status === 'pending',
    );
  };

  // Actually finalize the pairing and open the wallet. Only reached AFTER the
  // user confirms the out-of-band verification code matches on their SSP Key.
  const finishSync = () => {
    stopBatchPolling();
    if (pollingSyncInterval) {
      clearInterval(pollingSyncInterval);
      pollingSyncInterval = undefined;
    }
    batchRef.current = initialBatchState();
    identityKeyXpubRef.current = '';
    verifyOpenRef.current = false;
    setVerifyGate(null);
    setIsModalKeyOpen(false);
    setActiveTab('scan');
    setKeyInput('');
    setKeyAutomaticInput('');
    synchronised(true);
  };

  // Build the ONE unified verification code for the chains synced this session.
  // Every chain is one entry: the identity chain (if paired this session) plus
  // any batch/activated chains that settled. Both devices aggregate over the
  // same set with the same function, so the codes are equal iff no relay
  // substitution happened. Display-only — never logged.
  const buildVerifyGate = (): VerifyGate | null => {
    const entries: VerifyEntry[] = [];
    // identity chain is just another entry (empty for an already-paired wallet
    // activating extra chains — identityKeyXpubRef is only set on first pairing)
    if (identityKeyXpubRef.current && xpubWallet) {
      entries.push({
        chain: identityChain,
        walletXpub: xpubWallet,
        keyXpub: identityKeyXpubRef.current,
      });
    }
    const currentBatch = batchRef.current;
    // Only fold in batch chains once the whole batch has settled, so the set
    // matches exactly what SSP Key aggregates (it shows the code after its
    // batch completes). Before that, aggregate over just the identity entry.
    if (currentBatch.phase === 'done') {
      (Object.keys(currentBatch.chains) as (keyof cryptos)[])
        .filter(
          (chain) =>
            currentBatch.chains[chain].status === 'synced' &&
            !!currentBatch.chains[chain].keyXpub,
        )
        .forEach((chain) => {
          entries.push({
            chain,
            walletXpub: currentBatch.chains[chain].xpubWallet,
            keyXpub: currentBatch.chains[chain].keyXpub as string,
          });
        });
    }
    if (!entries.length) return null;
    const words = sessionVerificationWords(entries);
    return {
      chains: entries.map((entry) => entry.chain),
      words,
      qrValue: verificationQrValue(words),
    };
  };

  // Gate before treating the vault as ready. Replaces the old direct-finalize:
  // present the verification code and require the explicit "they match" action.
  const completeSync = () => {
    if (verifyOpenRef.current) return;
    const gate = buildVerifyGate();
    if (!gate) {
      // Nothing to cross-check (e.g. a skip mid-batch with no captured keys) —
      // the sync already passed its cryptographic checks, so finalize.
      finishSync();
      return;
    }
    stopBatchPolling();
    if (pollingSyncInterval) {
      clearInterval(pollingSyncInterval);
      pollingSyncInterval = undefined;
    }
    verifyOpenRef.current = true;
    setVerifyGate(gate);
  };

  const confirmVerification = () => {
    verifyOpenRef.current = false;
    finishSync();
  };

  // The user reported the codes DON'T match — a possible relay substitution.
  // Discard the just-synced key material for this vault, warn, and return to
  // pairing. Never proceed into the wallet.
  const abortVerification = () => {
    verifyOpenRef.current = false;
    setVerifyGate(null);
    identityKeyXpubRef.current = '';
    setXpubKey(activeChain, '');
    try {
      secureLocalStorage.removeItem(`2-${derivationPath}`);
    } catch (error) {
      console.log(error);
    }
    displayMessage('warning', t('home:key.verify_mismatch_warning'));
    logoutOrSwitchChain();
  };

  const checkSynced = () => {
    if (!syncRunning && sspWalletInternalIdentity) {
      axios
        .get<syncSSPRelay>(
          `https://${sspConfig().relay}/v1/sync/${sspWalletInternalIdentity}`,
        )
        .then(async (res) => {
          if (res.data.chain !== activeChain) {
            // batch chain sync: a doc for another requested chain
            await handleBatchSyncDoc(res.data);
            return;
          }
          setPhoneDetected(true);
          markBatchArrival();
          const xpubKey = res.data.keyXpub;
          const wkIdentity = res.data.wkIdentity;
          const sspKeyWalletXpub = res.data.walletXpub;
          // Verify ssp-key received correct wallet xpub
          if (sspKeyWalletXpub && sspKeyWalletXpub !== xpubWallet) {
            console.error('sspKeyWalletXpub mismatch');
            displayMessage('error', t('home:key.err_sync_fail'));
            syncRunning = false;
            if (pollingSyncInterval) {
              clearInterval(pollingSyncInterval);
            }
            return;
          }
          // For identity chain, verify both wkIdentity and first address
          if (activeChain === identityChain) {
            const sspKeyGeneratedAddress = res.data.generatedAddress;
            // Verify wkIdentity (index 10, 0)
            const generatedSspWalletKeyIdentity = generateMultisigAddress(
              xpubWallet,
              xpubKey,
              10,
              0,
              activeChain,
            );
            if (generatedSspWalletKeyIdentity.address !== wkIdentity) {
              console.error('wkIdentity mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
            // Verify first address (index 0, 0)
            const generatedFirstAddress = generateMultisigAddress(
              xpubWallet,
              xpubKey,
              0,
              0,
              activeChain,
            );
            if (
              sspKeyGeneratedAddress &&
              generatedFirstAddress.address !== sspKeyGeneratedAddress
            ) {
              console.error('generatedFirstAddress mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
            // Script verification - not strictly needed but extra assurance
            const sspKeyWitnessScript = res.data.witnessScript;
            const sspKeyRedeemScript = res.data.redeemScript;
            if (
              sspKeyWitnessScript &&
              generatedFirstAddress.witnessScript &&
              sspKeyWitnessScript !== generatedFirstAddress.witnessScript
            ) {
              console.error('witnessScript mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
            if (
              sspKeyRedeemScript &&
              generatedFirstAddress.redeemScript &&
              sspKeyRedeemScript !== generatedFirstAddress.redeemScript
            ) {
              console.error('redeemScript mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
          } else {
            // For non-identity chains, verify first address matches to prove keyXpub is correct
            const sspKeyGeneratedAddress = res.data.generatedAddress;
            const generatedAddress = generateMultisigAddress(
              xpubWallet,
              xpubKey,
              0,
              0,
              activeChain,
            );
            if (
              sspKeyGeneratedAddress &&
              generatedAddress.address !== sspKeyGeneratedAddress
            ) {
              console.error('generatedAddress mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
            // Script verification - not strictly needed but extra assurance
            const sspKeyWitnessScript = res.data.witnessScript;
            const sspKeyRedeemScript = res.data.redeemScript;
            if (
              sspKeyWitnessScript &&
              generatedAddress.witnessScript &&
              sspKeyWitnessScript !== generatedAddress.witnessScript
            ) {
              console.error('witnessScript mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
            if (
              sspKeyRedeemScript &&
              generatedAddress.redeemScript &&
              sspKeyRedeemScript !== generatedAddress.redeemScript
            ) {
              console.error('redeemScript mismatch');
              displayMessage('error', t('home:key.err_sync_fail'));
              syncRunning = false;
              if (pollingSyncInterval) {
                clearInterval(pollingSyncInterval);
              }
              return;
            }
          }
          if (res.data.publicNonces) {
            // ssp key can send us newly generated public nonces. Replace our nonces with these
            const sspKeyPublicNonces = res.data.publicNonces;
            await localForage
              .setItem('sspKeyPublicNonces', sspKeyPublicNonces)
              .catch((error) => console.log(error)); // we do not need to throw an error
          }
          // Enterprise nonce auto-replenish for wallet (debounced — skip if already running)
          if (
            res.data.enterpriseNoncesNeeded?.wallet &&
            wkIdentity &&
            passwordBlob &&
            !nonceReplenishRunning
          ) {
            nonceReplenishRunning = true;
            replenishWalletEnterpriseNonces(wkIdentity, passwordBlob)
              .catch((e) =>
                console.log('[Enterprise Nonces] wallet replenish error:', e),
              )
              .finally(() => {
                nonceReplenishRunning = false;
              });
          }
          // synced ok
          setVerified(true);
          syncRunning = false;
          if (pollingSyncInterval) {
            clearInterval(pollingSyncInterval);
            pollingSyncInterval = undefined;
          }

          setKeyInput(xpubKey);
          setKeyAutomaticInput(xpubKey);
        })
        .catch((error) => {
          console.log(error);
          syncRunning = false;
        });
    }
  };

  useEffect(() => {
    if (keyAutomaticInput) {
      handleOkModalKey();
    }
  }, [keyAutomaticInput]);

  const handleOkModalKey = () => {
    // display dialog awaiting synchronisation. This is automatic stuff
    if (!keyInput && !keyAutomaticInput) {
      displayMessage(
        'warning',
        identityChain
          ? t('home:key.warn_await_sync')
          : t('home:key.warn_await_sync_chain', {
              chain: blockchainConfig.name,
            }),
      );
      return;
    }
    const xpubKeyInput = keyInput || keyAutomaticInput;
    // validate xpub key is correct
    if (xpubKeyInput.trim() === xpubWallet.trim()) {
      displayMessage(
        'error',
        identityChain
          ? t('home:key.err_sync_1')
          : t('home:key.err_sync_1_chain', { chain: blockchainConfig.name }),
      );
      return;
    }
    const isSolanaChain = blockchainConfig.chainType === 'sol';
    const inputValid = isSolanaChain
      ? isSolanaPubkeyArrayString(xpubKeyInput)
      : xpubRegex.test(xpubKeyInput);
    if (inputValid) {
      // alright we are in business
      let keyValid = true;
      // try generating an address from it
      try {
        generateMultisigAddress(xpubWallet, xpubKeyInput, 0, 0, activeChain);
      } catch (error) {
        console.log(error);
        keyValid = false;
        displayMessage('error', t('home:key.err_invalid_key'));
      }
      if (!keyValid) return;
      const xpub2 = xpubKeyInput;
      setXpubKey(activeChain, xpub2);
      const fingerprint: string = getFingerprint();

      passworderDecrypt(fingerprint, passwordBlob)
        .then(async (password) => {
          // encrypt xpub of key it and store it to secure storage
          if (typeof password === 'string') {
            const encryptedXpub2 = await passworderEncrypt(password, xpub2);
            secureLocalStorage.setItem(`2-${derivationPath}`, encryptedXpub2);
            // now we have both xpubWallet and xpubKey
            setVerified(true);
            markBatchChainSynced(activeChain);
            // retain the key xpub (display-only) for the verification code:
            // identity pairing → the single-pair code; a non-identity chain
            // activated via batch → its entry in the aggregate code.
            if (isIdentityChain) {
              identityKeyXpubRef.current = xpub2;
            } else if (batchRef.current.chains[activeChain]) {
              batchRef.current.chains[activeChain].keyXpub = xpub2;
            }
            activeChainDoneRef.current = true;
            if (pollingSyncInterval) {
              clearInterval(pollingSyncInterval);
              pollingSyncInterval = undefined;
            }
            setKeyInput('');
            setKeyAutomaticInput('');
            if (
              isIdentityChain &&
              selectedChainsRef.current.length > 0 &&
              batchRef.current.phase === 'idle'
            ) {
              // identity pairing done — activate the preselected extra
              // chains with ONE approval on the key (the wkIdentity is
              // derived from the just-verified xpubs). The view stays open
              // showing live progress; "Continue to wallet" is always there.
              const generatedWkIdentity = generateMultisigAddress(
                xpubWallet,
                xpub2,
                10,
                0,
                activeChain,
              ).address;
              void startBatch(selectedChainsRef.current, generatedWkIdentity);
            } else if (batchStillWorking()) {
              // additional batch chains still syncing — stay open to show
              // progress; completeSync fires when the last one lands
              refreshBatch();
            } else {
              // open our wallet, tell parent that all is synced
              completeSync();
            }
          } else {
            displayMessage('error', t('home:key.err_k2'));
          }
        })
        .catch((e) => {
          console.log(e);
          displayMessage('error', t('home:key.err_k1'));
        });
    } else {
      displayMessage('error', t('home:key.err_invalid_key'));
    }
  };

  const handleCancelModalKey = () => {
    // display confirmation dialog and tell that we are 2fa. If no Key, log out.
    showConfirmCancelModalKey();
  };

  const logoutOrSwitchChain = () => {
    try {
      stopBatchPolling();
      batchRef.current = initialBatchState();
      setActiveTab('scan');
      setKeyInput('');
      setKeyAutomaticInput('');
      if (activeChain !== identityChain) {
        dispatch(setActiveChain(identityChain));
        void (async function () {
          await localForage.setItem('activeChain', identityChain);
          setTimeout(() => {
            setIsModalKeyOpen(false);
            synchronised(true);
          }, 50);
        })();
      } else {
        // tell parent of failiure to logout
        synchronised(false);
      }
      if (pollingSyncInterval) {
        clearInterval(pollingSyncInterval);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const showConfirmCancelModalKey = () => {
    confirm({
      title: isIdentityChain
        ? t('home:key.cancel_sync_q')
        : t('home:key.cancel_sync_q_chain', { chain: blockchainConfig.name }),
      icon: <ExclamationCircleFilled />,
      okText: t('home:key.cancel_sync'),
      cancelText: t('home:key.back_to_sync'),
      content: isIdentityChain
        ? t('home:key.sync_info_content')
        : t('home:key.sync_info_content_chain', {
            chain: blockchainConfig.name,
          }),
      onOk() {
        logoutOrSwitchChain();
      },
      onCancel() {
        console.log('Cancel, just hide confirmation dialog');
      },
    });
  };

  const restartBatch = () => {
    stopBatchPolling();
    batchRef.current = initialBatchState();
    refreshBatch();
    const wkIdentity = sspWalletKeyInternalIdentity;
    if (!wkIdentity) return;
    const chains = isIdentityChain
      ? selectedChainsRef.current
      : [activeChain, ...selectedChainsRef.current];
    void startBatch(chains, wkIdentity);
  };

  // ==== presentation ====

  const batch = batchRef.current;
  const batchChainList = Object.keys(batch.chains) as (keyof cryptos)[];
  const batchTotal = batchChainList.length;
  const batchDone = batchChainList.filter(
    (chain) => batch.chains[chain].status !== 'pending',
  ).length;
  const batchActive = batch.phase !== 'idle';
  const chipsEditable =
    batch.phase === 'idle' ||
    batch.phase === 'fallback' ||
    batch.phase === 'rejected' ||
    batch.phase === 'done';

  // chains offered for extra activation: everything except the identity
  // chain, the chain being activated, and chains that are already synced
  const offeredChains = (Object.keys(blockchains) as (keyof cryptos)[]).filter(
    (chain) => {
      if (chain === identityChain || chain === activeChain) return false;
      return !store.getState()[chain]?.xpubKey;
    },
  );

  const toggleChain = (chain: keyof cryptos, checked: boolean) => {
    setSelectedChains((previous) =>
      checked
        ? [...previous, chain]
        : previous.filter((selected) => selected !== chain),
    );
  };

  const qrValue = isIdentityChain ? xpubWallet : `${activeChain}:${xpubWallet}`;
  // QR error-correction level vs. payload size — display size is adaptive
  // (capped at 256px) so cell size shrinks as data grows. Pick the EC level
  // that gives both decent damage tolerance AND cells big enough for a
  // phone camera to resolve at typical scan distance:
  //   - Short payloads (~120 chars, normal xpub): Q (25%) — the QR has few
  //     enough modules that cells stay large; Q gives reliable recovery
  //     without forcing tiny cells.
  //   - Long payloads (Solana's ~950-char JSON pubkey array): M (15%) —
  //     fewer redundancy modules than Q/H, so cells stay resolvable on a
  //     phone camera while still tolerating some glare/angle.
  const qrErrorLevel = qrValue.length > 200 ? 'M' : 'Q';
  const qrSize = Math.min(
    256,
    Math.max(
      180,
      (typeof window !== 'undefined' ? window.innerWidth : 360) - 96,
    ),
  );

  type TimelineItem = {
    title: string;
    status: 'finish' | 'process' | 'wait' | 'error';
  };

  const timelineItems = (): TimelineItem[] => {
    const syncingTitle = t('home:key.timeline_syncing_chains', {
      done: batchDone,
      total: batchTotal,
    });
    if (isIdentityChain) {
      const items: TimelineItem[] = [
        {
          title: t('home:key.timeline_waiting_scan'),
          status: phoneDetected ? 'finish' : 'process',
        },
        {
          title: t('home:key.timeline_phone_detected'),
          status: phoneDetected ? 'finish' : 'wait',
        },
        {
          title: t('home:key.timeline_verifying'),
          status: verified ? 'finish' : phoneDetected ? 'process' : 'wait',
        },
      ];
      if (selectedChains.length > 0 || batchActive) {
        items.push({
          title: batchActive
            ? syncingTitle
            : t('home:key.timeline_activating', {
                total: selectedChains.length,
              }),
          status:
            batch.phase === 'done'
              ? 'finish'
              : batch.phase === 'rejected' || batch.phase === 'fallback'
                ? 'error'
                : batchActive
                  ? 'process'
                  : 'wait',
        });
      }
      items.push({
        title: t('home:key.timeline_ready'),
        status:
          verified && (!batchActive || batch.phase === 'done')
            ? 'finish'
            : 'wait',
      });
      return items;
    }
    // already-paired wallet activating chains
    return [
      {
        title: t('home:key.timeline_request_sent'),
        status:
          batch.phase === 'preparing'
            ? 'process'
            : batch.phase === 'idle'
              ? 'wait'
              : 'finish',
      },
      {
        title: t('home:key.timeline_approved_phone'),
        status: batch.receivedAny
          ? 'finish'
          : batch.phase === 'rejected'
            ? 'error'
            : batch.phase === 'awaiting' || batch.phase === 'fallback'
              ? 'process'
              : 'wait',
      },
      {
        title: syncingTitle,
        status:
          batch.phase === 'done'
            ? 'finish'
            : batch.phase === 'syncing'
              ? 'process'
              : 'wait',
      },
      {
        title: t('home:key.timeline_ready'),
        status:
          batch.phase === 'done' && activeChainDoneRef.current
            ? 'finish'
            : 'wait',
      },
    ];
  };

  const scanTab = (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <p style={{ marginTop: 0 }}>
        {isIdentityChain
          ? t('home:key.sync_info_2')
          : t('home:key.sync_info_2_chain', { chain: blockchainConfig.name })}
      </p>
      {offeredChains.length > 0 && (
        <div className="keySyncChips">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isIdentityChain
              ? t('home:key.chips_label_identity')
              : t('home:key.chips_label_chain')}
          </Text>
          <div className="keySyncChipsRow">
            {offeredChains.map((chain) => (
              <Tag.CheckableTag
                key={chain}
                checked={selectedChains.includes(chain)}
                onChange={(checked) => {
                  if (chipsEditable) toggleChain(chain, checked);
                }}
              >
                {blockchains[chain].name}
              </Tag.CheckableTag>
            ))}
          </div>
          {!isIdentityChain &&
            chipsEditable &&
            batch.phase !== 'idle' &&
            sspWalletKeyInternalIdentity && (
              <Button size="small" onClick={restartBatch}>
                {t('home:key.batch_resend_request')}
              </Button>
            )}
        </div>
      )}
      {batch.phase === 'fallback' && (
        <Alert
          type="info"
          showIcon
          message={t('home:key.batch_fallback_info')}
        />
      )}
      {batch.phase === 'rejected' && (
        <Alert
          type="warning"
          showIcon
          message={t('home:key.batch_rejected_info')}
        />
      )}
      <QRCode
        errorLevel={qrErrorLevel}
        value={qrValue}
        icon={sspLogo}
        size={qrSize}
        style={{ margin: '0 auto' }}
      />
      <Paragraph
        copyable={{
          text: qrValue,
        }}
        className="copyableAddress"
      >
        <Text>{qrValue}</Text>
      </Paragraph>
      <Steps
        direction="vertical"
        size="small"
        className="keySyncTimeline"
        items={timelineItems()}
      />
      {batch.phase === 'preparing' && (
        <Text type="secondary">{t('home:key.batch_preparing')}</Text>
      )}
    </Space>
  );

  const manualTab = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <TextArea
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        placeholder={t('home:key.input_xpub', {
          path: derivationPath,
          chain: blockchainConfig.name,
        })}
        autoSize={{ minRows: 3 }}
      />
      <Button type="primary" block onClick={handleOkModalKey}>
        {isIdentityChain
          ? t('home:key.sync_key')
          : t('home:key.sync_key_chain', { chain: blockchainConfig.name })}
      </Button>
    </Space>
  );

  // Render the 6 words as two groups of 3, each word numbered (1–6) with a
  // subtle per-position colour accent so a side-by-side human comparison with
  // SSP Key (identical order, casing and accents) is fast.
  const renderWordChip = (word: string, index: number) => (
    <span
      key={`${index}-${word}`}
      className="keyVerifyChip"
      style={{
        background: token.colorBgContainer,
        borderColor: token.colorBorder,
      }}
    >
      <span
        className="keyVerifyChipIndex"
        style={{
          color: '#fff',
          background: VERIFY_ACCENTS[index % VERIFY_ACCENTS.length],
        }}
      >
        {index + 1}
      </span>
      <span className="keyVerifyChipWord" style={{ color: token.colorText }}>
        {word}
      </span>
    </span>
  );

  const renderWordChips = (words: string[]) => (
    <div className="keyVerifyGroups" data-testid="key-verify-words">
      <div className="keyVerifyChips">
        {words.slice(0, 3).map((word, index) => renderWordChip(word, index))}
      </div>
      <div className="keyVerifyChips">
        {words.slice(3).map((word, index) => renderWordChip(word, index + 3))}
      </div>
    </div>
  );

  const verifyPanel = verifyGate && (
    <Space
      direction="vertical"
      size="middle"
      style={{ width: '100%' }}
      data-testid="key-verify-panel"
    >
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ marginBottom: 4 }}>
          {t('home:key.verify_words_heading')}
        </h3>
        <Text type="secondary">{t('home:key.verify_words_body')}</Text>
      </div>
      <div className="keyVerifyScan">
        <QRCode
          errorLevel="M"
          value={verifyGate.qrValue}
          icon={sspLogo}
          size={Math.min(200, qrSize)}
          style={{ margin: '0 auto' }}
        />
        <Text type="secondary" className="keyVerifyScanHint">
          {t('home:key.verify_scan_hint')}
        </Text>
      </div>
      <div>
        <Text strong>
          {t('home:key.verify_words_session_label', {
            count: verifyGate.chains.length,
          })}
        </Text>
        {renderWordChips(verifyGate.words)}
      </div>
      <Button
        type="primary"
        block
        onClick={confirmVerification}
        data-testid="key-verify-match"
      >
        {t('home:key.verify_words_match')}
      </Button>
      <Button
        danger
        block
        onClick={abortVerification}
        data-testid="key-verify-mismatch"
      >
        {t('home:key.verify_words_mismatch')}
      </Button>
    </Space>
  );

  return (
    <>
      {isModalKeyOpen && (
        <div
          className="keySyncView"
          style={{ background: token.colorBgLayout }}
          data-testid="key-sync-view"
        >
          <div className="keySyncViewInner">
            <h2 style={{ marginBottom: 8 }}>
              {isIdentityChain
                ? t('home:key.dual_factor_key')
                : t('home:key.dual_factor_key_chain', {
                    chain: blockchainConfig.name,
                  })}
            </h2>
            {isIdentityChain && <CreationSteps step={3} import={false} />}
            {verifyGate ? (
              verifyPanel
            ) : (
              <>
                <p>{t('home:key.sync_info_1')}</p>
                <Tabs
                  activeKey={activeTab}
                  onChange={(key) => setActiveTab(key as 'scan' | 'manual')}
                  centered
                  items={[
                    {
                      key: 'scan',
                      label: t('home:key.tab_scan'),
                      children: scanTab,
                    },
                    {
                      key: 'manual',
                      label: t('home:key.tab_manual'),
                      children: manualTab,
                    },
                  ]}
                />
                {verified && batchActive && batch.phase !== 'done' && (
                  <Button type="primary" block onClick={completeSync}>
                    {t('home:key.continue_to_wallet')}
                  </Button>
                )}
              </>
            )}
            {isIdentityChain && !verifyGate && (
              <>
                {!isSSPKeyDownloadOpen && (
                  <Button
                    type="link"
                    block
                    size="large"
                    onClick={() => setIsSSPKeyDownloadOpen(true)}
                    style={{ whiteSpace: 'normal' }}
                  >
                    {t('home:key.ssp_key_download_here')}
                  </Button>
                )}
                {isSSPKeyDownloadOpen && (
                  <div className="keySyncDownload">
                    <p>
                      <b>{t('home:key.ssp_key_2fa')}</b>
                    </p>
                    <p>{t('home:key.ssp_key_download')}</p>
                    <Space direction="vertical" size="small">
                      <QRCode
                        errorLevel="H"
                        value="https://sspwallet.io/download/ssp-key"
                        icon={sspLogo}
                        size={qrSize}
                        style={{ margin: '0 auto' }}
                      />
                      <Paragraph
                        copyable={{
                          text: 'https://sspwallet.io/download/ssp-key',
                        }}
                        className="copyableAddress"
                      >
                        <Text>https://sspwallet.io/download/ssp-key</Text>
                      </Paragraph>
                    </Space>
                    <p>{t('home:key.ssp_key_download_2')}</p>
                    <Button
                      type="default"
                      onClick={() => setIsSSPKeyDownloadOpen(false)}
                    >
                      {t('home:key.ssp_key_ready')}
                    </Button>
                  </div>
                )}
              </>
            )}
            {!verifyGate && (
              <Button
                type="text"
                block
                onClick={handleCancelModalKey}
                style={{ marginTop: 12 }}
              >
                {t('common:cancel')}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default Key;
