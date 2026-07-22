/**
 * Solana send strategy hook — the stateful half of the strategy.
 *
 * ALL state, effects (paymaster schedule, multisig init probe, destination
 * ATA probe, vault balance) and the onFinish submit handler are lifted from
 * the legacy src/pages/SendSOL/SendSOL.tsx (deleted with this unification).
 * Transaction construction still goes through the unchanged lib/constructTx
 * functions (getSolanaMultisigInitState, constructAndSignSOLTransaction)
 * with identical inputs — invariant 1.
 *
 * Fee presets: the SOL fee is a paymaster reimbursement (not a speed
 * market), so only Normal (schedule-derived automatic — the legacy auto
 * mode) and Custom (legacy manual mode with the at-least-the-floor rule)
 * are offered.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from '../../lib/toast';
import { useNavigate, useLocation } from 'react-router';
import { Form, Input } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { useTranslation } from 'react-i18next';

import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useSocket } from '../../hooks/useSocket';
import { setContacts } from '../../store';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { getFingerprint } from '../../lib/fingerprint';
import {
  generateAddressKeypair,
  generateMultisigAddressSOL,
  getScriptType,
} from '../../lib/wallet';
import {
  getSolanaMultisigInitState,
  constructAndSignSOLTransaction,
} from '../../lib/constructTx';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import { backends } from '@storage/backends';
import {
  validateSolRecipient,
  computeSolAutoFee,
  type SolFeeSchedule,
} from '../../lib/sendStrategies/sol';
import type { FeePresetKey } from '../../lib/sendStrategies/utxo';
import type { SendStrategyView, FeePresetView } from './types';

interface tokenOption {
  label: string;
  value: string;
}

interface sendForm {
  receiver: string;
  amount: string;
  asset: string;
  fee: string;
  message?: string;
}

interface LocationState {
  receiver?: string;
  amount?: string;
  contract?: string;
}

let txSentInterval: ReturnType<typeof setInterval> | undefined;

export function useSolSendStrategy(): SendStrategyView {
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm<sendForm>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const dispatch = useAppDispatch();

  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (s) => s.sspState,
  );
  const { xpubKey, xpubWallet, walletInUse, wallets, importedTokens } =
    useAppSelector((s) => s[activeChain]);
  const { passwordBlob } = useAppSelector((s) => s.passwordBlob);
  const { contacts } = useAppSelector((s) => s.contacts);
  const { cryptoRates, fiatRates } = useAppSelector((s) => s.fiatCryptoRates);

  const blockchainConfig = blockchains[activeChain];
  const { createWkIdentityAuth } = useRelayAuth();

  // Socket-delivered txid for SUBSEQUENT-send path (Key broadcasts and
  // posts `txid` back; SocketContext relays it here). First-send path
  // (merged flow) gets txid synchronously from the broadcast call.
  const {
    txid: socketTxid,
    clearTxid,
    txRejected: socketTxRejected,
    chain: socketChain,
    clearTxRejected,
  } = useSocket();

  // Local UI state — mirrors the legacy page.
  const [txReceiver, setTxReceiver] = useState('');
  const [txToken, setTxToken] = useState(''); // mint or '' for native
  const [txMessage, setTxMessage] = useState('');
  const [sendingAmount, setSendingAmount] = useState('0');
  const [txFee, setTxFee] = useState('0');
  const [feePreset, setFeePreset] = useState<FeePresetKey>('normal');
  const [autoFee, setAutoFee] = useState('0'); // baseline used for floor + reset
  const [spendableBalance, setSpendableBalance] = useState('0');
  const [validateStatusAmount, setValidateStatusAmount] = useState<
    '' | 'success' | 'error' | 'warning' | 'validating' | undefined
  >('success');
  const [useMaximum, setUseMaximum] = useState(false);
  const [tokenItems, setTokenItems] = useState<tokenOption[]>([]);
  const [feeSchedule, setFeeSchedule] = useState<SolFeeSchedule | null>(null);
  const [paymasterPubkey, setPaymasterPubkey] = useState('');
  const [needsInit, setNeedsInit] = useState(true);
  // Recipient's Associated Token Account existence — when true for an SPL
  // send, the create-ATA-idempotent ix is a no-op and we can drop the fee
  // bump. Null = unknown (treat as "missing" → charge bump defensively).
  const [destAtaExists, setDestAtaExists] = useState<boolean | null>(null);

  // Submit-flow state.
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // "custom" preset === the legacy manual-fee mode.
  const manualFee = feePreset === 'custom';

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({ type, content });
  };

  // Socket-delivered txid (subsequent-send path — Key broadcasts and posts
  // `txid` back via the standard relay action). Closes the wait modal and
  // opens the success modal. First-send path doesn't go through this —
  // the broadcast call returns the txid synchronously inline.
  useEffect(() => {
    if (socketTxid && socketChain === activeChain) {
      setTxHex(socketTxid);
      setOpenConfirmTx(false);
      setOpenTxSent(true);
      setSubmitting(false);
      clearTxid?.();
    }
  }, [socketTxid, socketChain, activeChain, clearTxid]);

  useEffect(() => {
    if (socketTxRejected && socketChain === activeChain) {
      setOpenConfirmTx(false);
      setOpenTxRejected(true);
      setSubmitting(false);
      clearTxRejected?.();
    }
  }, [socketTxRejected, socketChain, activeChain, clearTxRejected]);

  // Pre-fill from navigation state (deep-link / payment request).
  useEffect(() => {
    if (state.amount) {
      setSendingAmount(state.amount);
      form.setFieldValue('amount', state.amount);
    }
    if (state.receiver) {
      setTxReceiver(state.receiver);
      form.setFieldValue('receiver', state.receiver);
    }
  }, [state.receiver, state.amount]);

  // Token list = blockchain presets + imported, filtered by activated.
  useEffect(() => {
    const activated = (wallets[walletInUse]?.activatedTokens || []).slice();
    activated.push(blockchainConfig.tokens[0].contract); // native is always active
    const all = blockchainConfig.tokens.concat(importedTokens ?? []);
    const filtered = all.filter((tk) => activated.includes(tk.contract));
    const items: tokenOption[] = filtered.map((tk) => ({
      label: tk.name + ' (' + tk.symbol + ')',
      value: tk.contract,
    }));
    setTokenItems(items);
    // Default to native SOL if state didn't pick a contract.
    const initial = state.contract || blockchainConfig.tokens[0].contract;
    setTxToken(initial);
    form.setFieldValue('asset', initial);
  }, [activeChain, importedTokens, walletInUse, state.contract]);

  // Fetch paymaster pubkey + fee schedule + multisig init status.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await axios.get<{
          status: string;
          data: {
            pubkey?: string;
            message?: string;
            fees?: SolFeeSchedule;
          };
        }>(
          `https://${sspConfig().relay}/v1/sol/paymaster?chain=${activeChain}`,
        );
        if (cancelled) return;
        if (
          resp.data.status === 'success' &&
          resp.data.data?.pubkey &&
          resp.data.data?.fees
        ) {
          setPaymasterPubkey(resp.data.data.pubkey);
          setFeeSchedule(resp.data.data.fees);
        }
        // Don't toast on mount if the paymaster isn't ready — the relay
        // may be briefly slow or the user may have just opened the page
        // before the request completes. The submit handler surfaces a
        // clear error if it's still unavailable when they actually send.
      } catch (e) {
        if (!cancelled) {
          console.log('[SendSOL] paymaster fetch error', e);
        }
      }
    })();

    // Also check whether this is a "first real send" — drives the
    // first-vs-subsequent fee tier. First real send = multisig hasn't been
    // used yet (transaction_index === 0), regardless of whether the
    // multisig+nonce were pre-provisioned via /v1/sol/setup hours earlier.
    void (async () => {
      try {
        if (!xpubKey || !xpubWallet) return;
        if (!xpubKey.startsWith('[') || !xpubWallet.startsWith('[')) return;
        const splittedDerPath = walletInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];
        const { isFirstRealSend } = await getSolanaMultisigInitState({
          chain: activeChain,
          walletPubkeyBase58: walletPubkeys[addressIndex],
          keyPubkeyBase58: keyPubkeys[addressIndex],
        });
        if (!cancelled) setNeedsInit(isFirstRealSend);
      } catch (e) {
        if (!cancelled) console.log('[SendSOL] init-status check failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChain, walletInUse, xpubKey, xpubWallet]);

  // Probe whether the recipient already has an ATA for the selected SPL
  // mint. When they do, the create-ATA-idempotent ix is a no-op and we
  // skip splFeeBumpLamports (~2.5M lamports / ~$0.40 saved per repeat send
  // to the same recipient). Null = unknown → fee logic treats as missing.
  useEffect(() => {
    let cancelled = false;
    setDestAtaExists(null);
    const isSpl = !!txToken && txToken !== blockchainConfig.tokens[0].contract;
    if (!isSpl || !txReceiver) return;
    void (async () => {
      try {
        const [{ Connection, PublicKey }, splToken] = await Promise.all([
          import('@solana/web3.js'),
          import('@solana/spl-token'),
        ]);
        const recipientPubkey = new PublicKey(txReceiver);
        const mint = new PublicKey(txToken);
        const destAta = splToken.getAssociatedTokenAddressSync(
          mint,
          recipientPubkey,
          true,
        );
        const backendNode = backends()[activeChain].node;
        const connection = new Connection(`https://${backendNode}`, {
          commitment: 'confirmed',
        });
        const info = await connection.getAccountInfo(destAta);
        if (!cancelled) setDestAtaExists(info !== null);
      } catch (e) {
        if (!cancelled) {
          console.log('[SendSOL] destAta probe failed', e);
          setDestAtaExists(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txReceiver, txToken, activeChain, blockchainConfig.tokens]);

  // autoFee is the schedule-derived baseline; manual fees can tip up but
  // not below it.
  useEffect(() => {
    const isSpl = !!txToken && txToken !== blockchainConfig.tokens[0].contract;
    const feeSol = computeSolAutoFee(
      feeSchedule,
      needsInit,
      isSpl,
      destAtaExists,
      blockchainConfig.decimals,
    );
    setAutoFee(feeSol);
    if (!manualFee) {
      setTxFee(feeSol);
      form.setFieldValue('fee', feeSol);
    }
  }, [feeSchedule, needsInit, txToken, manualFee, destAtaExists]);

  // Spendable balance: vault SOL for native, vault token balance for SPL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!xpubKey?.startsWith('[') || !xpubWallet?.startsWith('[')) return;
        const splittedDerPath = walletInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];
        const vaultInfo = generateMultisigAddressSOL(
          walletPubkeys[addressIndex],
          keyPubkeys[addressIndex],
          0,
          activeChain,
        );
        const isNative =
          !txToken || txToken === blockchainConfig.tokens[0].contract;
        if (isNative) {
          const bal = await fetchAddressBalance(vaultInfo.address, activeChain);
          if (!cancelled) setSpendableBalance(bal.confirmed);
        } else {
          const tokenBalances = await fetchAddressTokenBalances(
            vaultInfo.address,
            activeChain,
            [txToken],
          );
          const tokenBal = tokenBalances.find((b) => b.contract === txToken);
          if (!cancelled) setSpendableBalance(tokenBal?.balance ?? '0');
        }
      } catch (e) {
        if (!cancelled) console.log('[SendSOL] balance fetch error', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txToken, walletInUse, activeChain, xpubKey, xpubWallet]);

  // Flag insufficient balance with a red input border.
  useEffect(() => {
    const tokenInfo = blockchainConfig.tokens
      .concat(importedTokens ?? [])
      .find((tk) => tk.contract === txToken);
    if (!tokenInfo) return;
    const isNative =
      !txToken || txToken === blockchainConfig.tokens[0].contract;
    const decimals = tokenInfo.decimals;
    const amountInBase = new BigNumber(sendingAmount || '0').multipliedBy(
      10 ** decimals,
    );
    const max = new BigNumber(spendableBalance);
    if (isNative) {
      // Native send + fee both come from vault SOL balance.
      const feeBase = new BigNumber(txFee || '0').multipliedBy(
        10 ** blockchainConfig.decimals,
      );
      setValidateStatusAmount(
        amountInBase.plus(feeBase).isGreaterThan(max) ? 'error' : 'success',
      );
    } else {
      // SPL: tokens come from token balance, fee comes from vault SOL.
      // Token balance check only — SOL fee balance is checked at submit time.
      setValidateStatusAmount(
        amountInBase.isGreaterThan(max) ? 'error' : 'success',
      );
    }
  }, [sendingAmount, spendableBalance, txFee, txToken, importedTokens]);

  // "Use Maximum" — fills amount with spendable - fee.
  useEffect(() => {
    if (!useMaximum) return;
    const tokenInfo = blockchainConfig.tokens
      .concat(importedTokens ?? [])
      .find((tk) => tk.contract === txToken);
    if (!tokenInfo) return;
    const isNative =
      !txToken || txToken === blockchainConfig.tokens[0].contract;
    const decimals = tokenInfo.decimals;
    const max = new BigNumber(spendableBalance).dividedBy(10 ** decimals);
    if (isNative) {
      const fee = new BigNumber(txFee || '0');
      const remaining = max.minus(fee);
      const value = remaining.isGreaterThan(0) ? remaining.toFixed() : '0';
      setSendingAmount(value);
      form.setFieldValue('amount', value);
    } else {
      setSendingAmount(max.toFixed());
      form.setFieldValue('amount', max.toFixed());
    }
  }, [useMaximum, spendableBalance, txFee, txToken]);

  const selectedTokenInfo = useMemo(
    () =>
      blockchainConfig.tokens
        .concat(importedTokens ?? [])
        .find((tk) => tk.contract === txToken) ?? blockchainConfig.tokens[0],
    [blockchainConfig.tokens, importedTokens, txToken],
  );

  const postAction = async (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
  ) => {
    const data: Record<string, unknown> = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
    };
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) Object.assign(data, auth);
    } catch (e) {
      console.warn('[SendSOL postAction] auth unavailable', e);
    }
    return axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  const onFinish = (values: sendForm) => {
    if (!validateSolRecipient(values.receiver)) {
      displayMessage('error', t('send:err_invalid_receiver'));
      return;
    }
    if (!values.amount || isNaN(+values.amount) || +values.amount <= 0) {
      displayMessage('error', t('send:input_amount'));
      return;
    }
    if (!feeSchedule || !paymasterPubkey) {
      displayMessage('error', 'Solana paymaster not ready, try again shortly');
      return;
    }
    if (!xpubKey?.startsWith('[') || !xpubWallet?.startsWith('[')) {
      displayMessage(
        'error',
        'Solana pairing not complete — partner pubkey array missing',
      );
      return;
    }

    setSubmitting(true);
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string')
          throw new Error('Password decryption failed');
        const xprivBlob = secureLocalStorage.getItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xprivBlob !== 'string')
          throw new Error('Wallet xpriv missing from secure storage');
        let xprivChain = await passworderDecrypt(password, xprivBlob);
        password = null;
        if (typeof xprivChain !== 'string')
          throw new Error('xpriv decrypt failed');

        const splittedDerPath = walletInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];

        const keyPair = generateAddressKeypair(
          xprivChain,
          0,
          addressIndex,
          activeChain,
        );
        xprivChain = null;

        const tokenMintBase58 =
          values.asset && values.asset !== blockchainConfig.tokens[0].contract
            ? values.asset
            : undefined;
        const decimals = selectedTokenInfo.decimals;
        const baseUnits = new BigNumber(values.amount)
          .multipliedBy(10 ** decimals)
          .toFixed(0);

        // Pre-flight balance checks.
        const vaultInfo = generateMultisigAddressSOL(
          walletPubkeys[addressIndex],
          keyPubkeys[addressIndex],
          0,
          activeChain,
        );
        if (tokenMintBase58) {
          const tokenBalances = await fetchAddressTokenBalances(
            vaultInfo.address,
            activeChain,
            [tokenMintBase58],
          );
          const tokenBal = tokenBalances.find(
            (b) => b.contract === tokenMintBase58,
          );
          if (!tokenBal || new BigNumber(tokenBal.balance).lt(baseUnits)) {
            throw new Error(
              `Insufficient ${selectedTokenInfo.symbol} balance in vault`,
            );
          }
        } else {
          const bal = await fetchAddressBalance(vaultInfo.address, activeChain);
          if (new BigNumber(bal.confirmed).lt(baseUnits)) {
            throw new Error('Insufficient SOL balance in vault');
          }
        }

        // Probe on-chain: do we need to ask the relay paymaster to set up
        // the multisig + durable nonce, and is this a first-real-send (for
        // fee tier)? Both are decoupled now: pre-setup may have happened
        // hours ago, but `isFirstRealSend` (transaction_index === 0) is
        // what determines paymaster reimbursement amount.
        const { needsSetup, isFirstRealSend } =
          await getSolanaMultisigInitState({
            chain: activeChain,
            walletPubkeyBase58: walletPubkeys[addressIndex],
            keyPubkeyBase58: keyPubkeys[addressIndex],
          });

        // If multisig and/or durable nonce missing, ask the relay paymaster
        // to atomically set both up (one paymaster-signed tx via
        // /v1/sol/setup, ~3s). This must complete before we build the send
        // tx because constructAndSignSOLTransaction assumes the nonce
        // account exists. Relay validates the vault has enough SOL to
        // reimburse the paymaster's setup costs before provisioning.
        if (needsSetup) {
          const setupRes = await axios.post<{
            status: string;
            data: {
              signature: string | null;
              multisigAddress: string;
              nonceAccount: string;
              nonceValue: string;
              alreadyProvisioned: boolean;
            };
          }>(`https://${sspConfig().relay}/v1/sol/setup`, {
            chain: activeChain,
            walletPubkey: walletPubkeys[addressIndex],
            keyPubkey: keyPubkeys[addressIndex],
          });
          if (setupRes.data?.status !== 'success') {
            throw new Error(
              `Solana vault setup failed: ${
                (setupRes.data as unknown as { data?: { message?: string } })
                  ?.data?.message ?? 'unknown error'
              }`,
            );
          }
        }

        const isSpl = !!tokenMintBase58;
        // Re-probe destAta at submit time — the UI state may be stale if
        // the user changed recipient/token quickly, and we want the fee
        // floor to reflect the actual on-chain state right before send.
        let bumpNeeded = isSpl;
        if (isSpl && tokenMintBase58) {
          try {
            const [{ Connection, PublicKey }, splToken] = await Promise.all([
              import('@solana/web3.js'),
              import('@solana/spl-token'),
            ]);
            const recipientPubkey = new PublicKey(values.receiver);
            const mint = new PublicKey(tokenMintBase58);
            const destAta = splToken.getAssociatedTokenAddressSync(
              mint,
              recipientPubkey,
              true,
            );
            const conn = new Connection(
              `https://${backends()[activeChain].node}`,
              { commitment: 'confirmed' },
            );
            const info = await conn.getAccountInfo(destAta);
            bumpNeeded = info === null;
          } catch (e) {
            // Probe failed — keep bump on for safety.
            console.log('[SendSOL] submit destAta probe failed', e);
          }
        }
        const autoLamports =
          (isFirstRealSend
            ? feeSchedule.firstSendLamports
            : feeSchedule.subsequentSendLamports) +
          (bumpNeeded ? feeSchedule.splFeeBumpLamports : 0);
        let paymasterFeeLamports: string;
        if (manualFee) {
          const manualLamports = new BigNumber(values.fee || '0')
            .multipliedBy(10 ** blockchainConfig.decimals)
            .integerValue(BigNumber.ROUND_HALF_UP);
          if (manualLamports.lt(autoLamports)) {
            throw new Error(
              `Manual fee must be at least ${new BigNumber(autoLamports)
                .dividedBy(10 ** blockchainConfig.decimals)
                .toFixed()} ${blockchainConfig.symbol}`,
            );
          }
          paymasterFeeLamports = manualLamports.toFixed(0);
        } else {
          paymasterFeeLamports = autoLamports.toString();
        }

        const signedTxBase64 = await constructAndSignSOLTransaction({
          chain: activeChain,
          recipient: values.receiver,
          amount: baseUnits,
          walletPubkeyBase58: walletPubkeys[addressIndex],
          keyPubkeyBase58: keyPubkeys[addressIndex],
          walletPrivKeyHex: keyPair.privKey,
          paymasterPubkeyBase58: paymasterPubkey,
          paymasterFeeLamports,
          tokenMintBase58,
          tokenDecimals: tokenMintBase58
            ? selectedTokenInfo.decimals
            : undefined,
          memo: values.message,
        });
        // Wrap the payload in JSON with token metadata so the Key can
        // display the SPL token's symbol + decimals on the approval screen
        // (the bare proposal bytes don't carry the mint, only ATAs). Native
        // SOL sends stay bare-base64 — old Keys handle them unchanged.
        const actionPayload = tokenMintBase58
          ? JSON.stringify({
              unsignedTxBase64: signedTxBase64,
              tokenMint: tokenMintBase58,
              tokenSymbol: selectedTokenInfo.symbol,
              tokenDecimals: selectedTokenInfo.decimals,
            })
          : signedTxBase64;
        await postAction(
          'tx',
          actionPayload,
          activeChain,
          walletInUse,
          sspWalletKeyInternalIdentity,
        );
        setTxHex(signedTxBase64);
        setOpenConfirmTx(true);
        setSubmitting(false);

        // Save recipient as a contact (if not already saved + not own address).
        const contactExists = contacts[activeChain]?.find(
          (c) => c.address === values.receiver,
        );
        const myAddresses: string[] = Object.keys(wallets).map(
          (w) => wallets[w].address,
        );
        if (!contactExists && !myAddresses.includes(values.receiver)) {
          const newContact = {
            id: new Date().getTime(),
            name: '',
            address: values.receiver,
          };
          const adjContacts = [...(contacts[activeChain] ?? []), newContact];
          const completeContacts = {
            ...contacts,
            [activeChain]: adjContacts,
          };
          dispatch(setContacts(completeContacts));
          void localForage
            .setItem('contacts', completeContacts)
            .catch((e) => console.log(e));
        }
      })
      .catch((error: Error) => {
        console.log(error);
        setSubmitting(false);
        // Close the wait-for-key modal if it was open — error supersedes it.
        setOpenConfirmTx(false);
        // Surface key-rejection vs other errors distinctly.
        if (error?.message?.includes('Key device rejected')) {
          setOpenTxRejected(true);
        } else {
          displayMessage('error', error?.message || 'Send failed');
        }
      });
  };

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
  };

  const txSentAction = (status: boolean) => {
    setOpenTxSent(status);
    setOpenConfirmTx(false);
    if (txSentInterval) clearInterval(txSentInterval);
    if (status) navigate('/home');
  };

  const txRejectedAction = (status: boolean) => {
    setOpenTxRejected(status);
    setOpenConfirmTx(false);
    if (txSentInterval) clearInterval(txSentInterval);
  };

  const cancelSend = () => {
    navigate('/home');
  };

  const isNativeAsset =
    !txToken || txToken === blockchainConfig.tokens[0].contract;

  const toFiat = (units: string | null): string | null => {
    if (units === null) {
      return null;
    }
    const numeric = new BigNumber(units || '0');
    if (!numeric.isFinite() || numeric.lte(0)) {
      return null;
    }
    const cr = cryptoRates[activeChain] ?? 0;
    const fi = fiatRates[sspConfig().fiatCurrency] ?? 0;
    if (!cr || !fi) {
      return null;
    }
    return formatFiatWithSymbol(numeric.multipliedBy(cr).multipliedBy(fi));
  };

  const receiverValid = validateSolRecipient(txReceiver);
  const showReceiverError = !!txReceiver.trim() && !receiverValid;

  // Pre-submit gate for compose → review (same checks onFinish re-runs).
  const validateCompose = (): string | null => {
    if (!validateSolRecipient(txReceiver)) {
      return t('send:err_invalid_receiver');
    }
    if (!sendingAmount || isNaN(+sendingAmount) || +sendingAmount <= 0) {
      return t('send:input_amount');
    }
    return null;
  };

  // The SOL fee is a paymaster reimbursement — no speed dimension, so only
  // Normal (automatic) + Custom (manual, floored at the schedule) exist.
  const feePresets: FeePresetView[] = [
    { key: 'normal', feeAmount: autoFee !== '0' ? autoFee : null },
    { key: 'custom', feeAmount: txFee || null },
  ];

  const selectPreset = (key: FeePresetKey) => {
    setFeePreset(key);
    if (key !== 'custom') {
      // Legacy toggle-back-to-automatic behavior: reset to the schedule fee.
      setTxFee(autoFee);
      form.setFieldValue('fee', autoFee);
    }
  };

  const totalDisplay = isNativeAsset
    ? new BigNumber(sendingAmount || '0').plus(txFee || '0').toFixed()
    : null;

  // Legacy manual fee input — total fee in SOL with the schedule floor
  // enforced at submit, exactly as before.
  const customFeeContent = (
    // No label — the section heading already reads "Max Network Fee".
    <Form.Item name="fee">
      <Input
        size="large"
        value={txFee}
        placeholder={t('send:max_tx_fee')}
        suffix={blockchainConfig.symbol}
        onChange={(e) => {
          setTxFee(e.target.value);
          form.setFieldValue('fee', e.target.value);
        }}
        disabled={!manualFee}
      />
    </Form.Item>
  );

  const modals = (
    <>
      <ConfirmTxKey
        open={openConfirmTx}
        openAction={confirmTxAction}
        txHex={txHex}
        chain={activeChain}
        wallet={walletInUse}
      />
      <TxSent
        open={openTxSent}
        openAction={txSentAction}
        txid={txHex}
        chain={activeChain}
      />
      <TxRejected open={openTxRejected} openAction={txRejectedAction} />
    </>
  );

  return {
    chainType: 'sol',
    headerTitle: '',
    submitLabel: t('send:send'),
    form,
    onFinish: (values) => onFinish(values as sendForm),
    cancel: cancelSend,
    submitting,
    tokenSelect: {
      items: tokenItems,
      value: txToken,
      onChange: (value: string) => setTxToken(value),
      disabled: false,
    },
    receiver: {
      value: txReceiver,
      set: (value: string) => {
        setTxReceiver(value);
        form.setFieldValue('receiver', value);
      },
      disabled: false,
      valid: receiverValid,
      showError: showReceiverError,
      errorText: showReceiverError ? t('send:err_invalid_receiver') : null,
      qrEnabled: true,
    },
    amount: {
      value: sendingAmount,
      set: (value: string) => {
        setSendingAmount(value);
        setUseMaximum(false);
      },
      status: validateStatusAmount,
      suffix: selectedTokenInfo.symbol,
      disabled: false,
      fiat: isNativeAsset ? toFiat(sendingAmount) : null,
      maxDisplay: new BigNumber(spendableBalance)
        .dividedBy(10 ** selectedTokenInfo.decimals)
        .toFixed(),
      onMax: () => setUseMaximum(true),
      maxDisabled: false,
    },
    message: { value: txMessage, set: setTxMessage },
    composeExtra: null,
    validateCompose,
    feePresets,
    selectedPreset: feePreset,
    selectPreset,
    customFeeContent,
    hiddenFormContent: null,
    feeDisplay: txFee || '---',
    // Normal preset is ready once the schedule-derived baseline exists ('0'
    // means "not yet derived", mirroring feePresets above); Custom is the
    // user's own fee.
    feeReady: manualFee ? txFee !== '' : autoFee !== '0',
    feeSymbol: blockchainConfig.symbol,
    feeFiat: toFiat(txFee),
    // Solana uses a flat, paymaster-reimbursed fee schedule — no market rate.
    feeRateDisplay: null,
    totalDisplay,
    totalFiat: toFiat(totalDisplay),
    isRBF: false,
    approveActive: openConfirmTx,
    modals,
  };
}
