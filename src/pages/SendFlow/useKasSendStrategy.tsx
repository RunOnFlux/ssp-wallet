/**
 * Kaspa send strategy hook — the stateful half of the Kaspa strategy.
 *
 * Modelled on useUtxoSendStrategy / useSolSendStrategy, but every chain
 * operation goes through lib/kaspa.ts (kaspa-core + kaspa-rest-server), never
 * utxolib/insight:
 *   - UTXOs come from REST; the fee is the planner's exact mass-based fee
 *     (plan.final.fee) at the selected preset's rate (economy/normal/fast from
 *     the node's fee estimate).
 *   - Max = the output of a sendAll plan.
 *   - maxFee = min(sspConfig().maxTxFeeUSD worth, blockchains.kas.maxFee).
 *   - Change returns to the sending vault address; no message/payload.
 *   - The wallet signs its half and posts action 'tx' with the SigningBundle
 *     JSON (contract §3/§5, no utxos). SSP Key co-signs and broadcasts.
 *   - The transaction ID is known before signing, so completion is detected by
 *     that ID (socket txid, or polling the indexer for it) — no amount matching.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../../lib/toast';
import { useNavigate, useLocation } from 'react-router';
import { Form } from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { useSocket } from '../../hooks/useSocket';
import { getFingerprint } from '../../lib/fingerprint';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import {
  fetchKasFeeRates,
  fetchKasUtxos,
  isKasTransactionKnown,
  kasRestClient,
  kasSignedAmountLedger,
  planKasSend,
  signKasSend,
  sumKasUtxos,
  type KasFeeTier,
} from '../../lib/kaspa';
import type { KaspaUtxo } from '@runonflux/kaspa-core/rest';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import { validateReceiverAddress } from '../../lib/addressValidation';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import { setContacts } from '../../store';
import type { swapResponseData } from '../../types';
import type { FeePresetKey } from '../../lib/sendStrategies/utxo';
import {
  KAS_PRESETS,
  KAS_PRESET_TIERS,
  kasAmountExceedsBalance,
  kasMaxFeeSompi,
  kasPlanErrorKey,
  kasPlanMatchesReview,
  sompiToUnits,
  unitsToSompi,
  type KasPresetKey,
} from '../../lib/sendStrategies/kas';
import { parseAmount, totalNative } from '../../lib/sendStrategies/amount';
import type { SendStrategyView, FeePresetView } from './types';

interface sendForm {
  receiver: string;
  amount: string;
  fee?: string;
  message?: string;
  paymentAction?: boolean;
  swap?: swapResponseData;
}

type FeeRates = Record<KasFeeTier, bigint>;

let txSentInterval: string | number | NodeJS.Timeout | undefined;

export function useKasSendStrategy(): SendStrategyView {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const state = (location.state ?? {}) as sendForm;
  const {
    txid: socketTxid,
    clearTxid,
    txRejected,
    chain: txChain,
    clearTxRejected,
  } = useSocket();
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (s) => s.sspState,
  );
  const { createWkIdentityAuth } = useRelayAuth();
  const { wallets, walletInUse, xpubWallet, xpubKey } = useAppSelector(
    (s) => s[activeChain],
  );
  const sender = wallets[walletInUse].address;
  const { contacts } = useAppSelector((s) => s.contacts);
  const { cryptoRates, fiatRates } = useAppSelector((s) => s.fiatCryptoRates);
  const { passwordBlob } = useAppSelector((s) => s.passwordBlob);
  const blockchainConfig = blockchains[activeChain];
  const decimals = blockchainConfig.decimals;
  const browser = window.chrome || window.browser;

  const [utxos, setUtxos] = useState<KaspaUtxo[] | null>(null);
  const [virtualDaaScore, setVirtualDaaScore] = useState<bigint | undefined>(
    undefined,
  );
  const [feeRates, setFeeRates] = useState<FeeRates | null>(null);
  const [feePreset, setFeePreset] = useState<KasPresetKey>('normal');
  const [sendingAmount, setSendingAmount] = useState('0');
  const [txReceiver, setTxReceiver] = useState('');
  const [useMaximum, setUseMaximum] = useState(false);
  // Planned fees per preset (coin units), null while unknown.
  const [presetFees, setPresetFees] = useState<
    Record<KasPresetKey, string | null>
  >({ slow: null, normal: null, fast: null });
  const [maxAmount, setMaxAmount] = useState('0');
  const [planError, setPlanError] = useState<string | null>(null);
  const [validateStatusAmount, setValidateStatusAmount] = useState<
    '' | 'success' | 'error' | 'warning' | 'validating' | undefined
  >('success');

  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [txid, setTxid] = useState('');
  // ID of the transaction awaiting the Key — known before signing.
  const expectedTxid = useRef('');

  const spendableBalance = utxos ? sumKasUtxos(utxos).toString() : '0';

  const maxFeeSompi = (): bigint => {
    const cr = cryptoRates[activeChain] ?? 0;
    const fiUSD = fiatRates.USD ?? 0;
    return kasMaxFeeSompi(
      sspConfig().maxTxFeeUSD,
      cr * fiUSD,
      decimals,
      blockchainConfig.maxFee,
    );
  };

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({ type, content });
  };

  const planErrorText = (error: unknown): string => {
    const key = kasPlanErrorKey(error);
    if (key) {
      // kasPlanErrorKey only returns keys that exist in send.json.
      return (t as unknown as (k: string) => string)(key);
    }
    return error instanceof Error ? error.message : t('send:err_s1');
  };

  const loadNetworkState = async () => {
    try {
      const [freshUtxos, rates, daa] = await Promise.all([
        fetchKasUtxos(sender, activeChain),
        fetchKasFeeRates(activeChain),
        kasRestClient(activeChain)
          .getVirtualDaaScore()
          .catch(() => undefined),
      ]);
      setUtxos(freshUtxos);
      setFeeRates(rates);
      setVirtualDaaScore(daa);
    } catch (error) {
      console.log(error);
      setPlanError(t('send:err_kas_network'));
    }
  };

  // Prefill from navigation state (payment request / swap / contacts).
  useEffect(() => {
    if (state.amount) {
      setSendingAmount(state.amount);
      form.setFieldValue('amount', state.amount);
    }
    if (state.receiver) {
      setTxReceiver(state.receiver);
      form.setFieldValue('receiver', state.receiver);
    }
    void loadNetworkState();
  }, []);

  // Re-plan whenever the inputs to the fee change. Planning is local (UTXOs
  // and rates already fetched), so all three presets are computed at once.
  useEffect(() => {
    if (!utxos || !feeRates || !xpubWallet || !xpubKey) {
      return;
    }
    const [typeIndex, addressIndex] = walletInUse.split('-').map(Number);
    const rv = validateReceiverAddress(txReceiver, activeChain);
    // Estimate as a send to ourselves until a valid receiver is entered.
    const receiver = rv.valid ? txReceiver.trim() : sender;
    const amountSompi = unitsToSompi(sendingAmount, decimals);
    const maxFee = maxFeeSompi();
    let cancelled = false;
    void (async () => {
      const fees: Record<KasPresetKey, string | null> = {
        slow: null,
        normal: null,
        fast: null,
      };
      let error: string | null = null;
      let max = '0';
      for (const preset of KAS_PRESETS) {
        const base = {
          chain: activeChain,
          xpubWallet,
          xpubKey,
          typeIndex,
          addressIndex,
          receiver,
          feeRate: feeRates[KAS_PRESET_TIERS[preset]],
          maxFeeSompi: maxFee,
          utxos,
          virtualDaaScore,
        };
        // Max = the single output of a sendAll plan at this preset's rate;
        // in Max mode that plan's fee is also the preset's fee.
        if ((preset === feePreset || useMaximum) && utxos.length > 0) {
          try {
            const all = await planKasSend({
              ...base,
              amountSompi: 0n,
              sendAll: true,
            });
            if (preset === feePreset) {
              max = sompiToUnits(all.plan.final.tx.outputs[0].value, decimals);
            }
            if (useMaximum) {
              fees[preset] = sompiToUnits(all.plan.final.fee, decimals);
            }
          } catch (e) {
            if (useMaximum && preset === feePreset) error = planErrorText(e);
          }
        }
        if (useMaximum) {
          continue;
        }
        if (!amountSompi) {
          continue;
        }
        try {
          const planned = await planKasSend({ ...base, amountSompi });
          fees[preset] = sompiToUnits(planned.plan.final.fee, decimals);
        } catch (e) {
          if (preset === feePreset) error = planErrorText(e);
        }
      }
      if (cancelled) return;
      setPresetFees(fees);
      setMaxAmount(max);
      setPlanError(error);
      if (useMaximum) {
        setSendingAmount(max);
        form.setFieldValue('amount', max);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    utxos,
    feeRates,
    virtualDaaScore,
    feePreset,
    sendingAmount,
    txReceiver,
    useMaximum,
    walletInUse,
    xpubWallet,
    xpubKey,
  ]);

  const txFee = presetFees[feePreset] ?? '';

  useEffect(() => {
    const exceeds = kasAmountExceedsBalance(
      sendingAmount,
      txFee,
      spendableBalance,
      decimals,
    );
    setValidateStatusAmount(exceeds || planError ? 'error' : 'success');
  }, [sendingAmount, txFee, spendableBalance, planError]);

  const finishWithTxid = (id: string) => {
    if (txSentInterval) {
      clearInterval(txSentInterval);
      txSentInterval = undefined;
    }
    expectedTxid.current = '';
    setTxid(id);
    void loadNetworkState();
  };

  useEffect(() => {
    if (txid) {
      setOpenConfirmTx(false);
      setTimeout(() => {
        if (state.paymentAction) {
          payRequestAction({
            status: 'SUCCESS', // do not translate
            data: t('home:payment_request.transaction_sent'),
            txid,
          });
        }
        setPendingApproval(false);
        setOpenTxSent(true);
      });
    }
  }, [txid]);

  useEffect(() => {
    if (socketTxid) {
      clearTxid?.();
      finishWithTxid(socketTxid);
    }
  }, [socketTxid]);

  useEffect(() => {
    if (txRejected) {
      setOpenConfirmTx(false);
      setTimeout(() => {
        if (state.paymentAction) {
          payRequestAction(null);
        }
        setPendingApproval(false);
        setOpenTxRejected(true);
      });
      if (txSentInterval) {
        clearInterval(txSentInterval);
        txSentInterval = undefined;
      }
      expectedTxid.current = '';
      clearTxRejected?.();
    }
  }, [txRejected]);

  useEffect(() => {
    return () => {
      if (txSentInterval) {
        clearInterval(txSentInterval);
        txSentInterval = undefined;
      }
    };
  }, []);

  const postAction = async (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
  ) => {
    // Kaspa: the payload is the SigningBundle JSON; no utxos field — SSP Key
    // fetches the vault UTXOs itself (contract §4.1).
    const data: Record<string, unknown> = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
    };
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch (error) {
      console.warn(
        '[postAction] Auth not available, sending without signature',
        error,
      );
    }
    await axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  const saveContact = (receiver: string) => {
    const contactExists = contacts[activeChain]?.find(
      (contact) => contact.address === receiver,
    );
    const myAddresses = Object.keys(wallets).map((w) => wallets[w].address);
    if (contactExists || myAddresses.includes(receiver)) {
      return;
    }
    const adjContacts = [...(contacts[activeChain] ?? [])];
    adjContacts.push({ id: new Date().getTime(), name: '', address: receiver });
    const completeContacts = { ...contacts, [activeChain]: adjContacts };
    dispatch(setContacts(completeContacts));
    void (async function () {
      try {
        await localForage.setItem('contacts', completeContacts);
      } catch (error) {
        console.log(error);
      }
    })();
  };

  const validateCompose = (): string | null => {
    const rv = validateReceiverAddress(txReceiver, activeChain);
    if (!rv.valid) {
      return rv.warningChainType
        ? t('send:err_wrong_chain_address', { chain: blockchainConfig.name })
        : t('send:err_invalid_receiver');
    }
    if (!unitsToSompi(sendingAmount, decimals)) {
      return t('send:err_invalid_amount');
    }
    return null;
  };

  const onFinish = async (values: sendForm) => {
    const composeError = validateCompose();
    if (composeError) {
      displayMessage('error', composeError);
      return;
    }
    if (!xpubWallet || !xpubKey) {
      displayMessage('error', t('send:err_invalid_xpriv'));
      return;
    }
    if (submitting) {
      return;
    }
    // What the user reviewed: amount, fee and the rate that fee was planned
    // at. The signed transaction must match all three exactly.
    const shownAmount = sendingAmount;
    const shownFeeSompi = unitsToSompi(txFee, decimals);
    const shownRate = feeRates?.[KAS_PRESET_TIERS[feePreset]];
    if (!shownFeeSompi || !shownRate || planError) {
      displayMessage('error', planError ?? t('send:err_kas_review_changed'));
      return;
    }
    setSubmitting(true);
    const receiver = (values.receiver || txReceiver).trim();
    const wInUse = walletInUse;
    const [typeIndex, addressIndex] = wInUse.split('-').map(Number);
    let password: string | null = null;
    let xprivChain: string | null = null;
    let privKey = '';
    try {
      // Plan with the DISPLAYED rate; only the UTXOs are re-fetched (never
      // sign against a stale coin set). No key material is touched yet.
      const freshUtxos = await fetchKasUtxos(sender, activeChain);
      const amountSompi = unitsToSompi(shownAmount, decimals) ?? 0n;
      const planned = await planKasSend({
        chain: activeChain,
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        receiver,
        amountSompi: useMaximum ? 0n : amountSompi,
        sendAll: useMaximum,
        feeRate: shownRate,
        maxFeeSompi: maxFeeSompi(),
        utxos: freshUtxos,
        virtualDaaScore,
      });
      if (planned.sender !== sender) {
        throw new Error(t('send:err_kas_vault_mismatch'));
      }
      if (!kasPlanMatchesReview(planned.plan, amountSompi, shownFeeSompi)) {
        // The coins moved since the review (Max amount or fee would change):
        // refresh UTXOs, rates and DAA score so the form re-plans, and make
        // the user confirm the new figures. Never sign a different fee or
        // amount than the one displayed.
        void loadNetworkState();
        throw new Error(t('send:err_kas_review_changed'));
      }

      // Only now decrypt and derive the wallet key.
      const fingerprint: string = getFingerprint();
      const decryptedPassword = await passworderDecrypt(
        fingerprint,
        passwordBlob,
      );
      if (typeof decryptedPassword !== 'string') {
        throw new Error(t('send:err_pwd_not_valid'));
      }
      password = decryptedPassword;
      const xprivBlob = secureLocalStorage.getItem(
        `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
          blockchainConfig.scriptType,
        )}-${blockchainConfig.id}`,
      );
      if (typeof xprivBlob !== 'string') {
        throw new Error(t('send:err_invalid_xpriv'));
      }
      const decryptedXpriv = await passworderDecrypt(password, xprivBlob);
      password = null;
      if (typeof decryptedXpriv !== 'string') {
        throw new Error(t('send:err_invalid_xpriv_decrypt'));
      }
      xprivChain = decryptedXpriv;
      privKey = generateAddressKeypair(
        xprivChain,
        typeIndex,
        addressIndex,
        activeChain,
      ).privKey;
      xprivChain = null;
      const { payload, txid: plannedTxid } = await signKasSend(
        planned,
        privKey,
        kasSignedAmountLedger(),
      );
      privKey = '';
      await postAction(
        'tx',
        payload,
        activeChain,
        wInUse,
        sspWalletKeyInternalIdentity,
      );
      expectedTxid.current = plannedTxid;
      setTxHex(payload);
      setSubmitting(false);
      setPendingApproval(true);
      setOpenConfirmTx(true);
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
      // Fallback when the socket txid never arrives: the ID is known, so poll
      // the indexer for exactly that transaction.
      txSentInterval = setInterval(() => {
        const id = expectedTxid.current;
        if (!id) return;
        void isKasTransactionKnown(id, activeChain).then((known) => {
          if (known && expectedTxid.current === id) {
            finishWithTxid(id);
          }
        });
      }, 5000);
      saveContact(receiver);
    } catch (error) {
      setSubmitting(false);
      console.log(error);
      displayMessage('error', planErrorText(error));
    } finally {
      // Every path — success, refusal or error — drops the key material.
      privKey = '';
      xprivChain = null;
      password = null;
    }
  };

  interface paymentData {
    status: string;
    txid?: string;
    data?: string;
  }

  const payRequestAction = (data: paymentData | null) => {
    if (browser?.runtime?.sendMessage) {
      if (!data) {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data: { status: 'ERROR', result: t('common:request_rejected') },
        });
      } else {
        void browser.runtime.sendMessage({ origin: 'ssp', data });
      }
    }
  };

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
  };
  const txSentAction = (status: boolean) => {
    setOpenTxSent(status);
    if (status === false) {
      navigate('/home');
    }
  };
  const txRejectedAction = (status: boolean) => {
    setOpenTxRejected(status);
  };

  const cancelSend = () => {
    if (state.paymentAction) {
      payRequestAction(null);
    }
    navigate('/home');
  };

  const receiverValidation = txReceiver.trim()
    ? validateReceiverAddress(txReceiver, activeChain)
    : { valid: true };
  const showReceiverError =
    !!txReceiver.trim() && !receiverValidation.valid && !state.swap;

  const toFiat = (units: string | null): string | null => {
    if (units === null) {
      return null;
    }
    const numeric = parseAmount(units || '0');
    if (!numeric || numeric.lte(0)) {
      return null;
    }
    const cr = cryptoRates[activeChain] ?? 0;
    const fi = fiatRates[sspConfig().fiatCurrency] ?? 0;
    if (!cr || !fi) {
      return null;
    }
    return formatFiatWithSymbol(numeric.multipliedBy(cr).multipliedBy(fi));
  };

  const feePresets: FeePresetView[] = useMemo(
    () =>
      KAS_PRESETS.map((key) => ({
        key,
        feeAmount: presetFees[key],
      })),
    [presetFees],
  );

  const totalDisplay = txFee
    ? (totalNative(sendingAmount, txFee) ?? '---')
    : '---';
  const rate = feeRates?.[KAS_PRESET_TIERS[feePreset]];

  const modals = (
    <>
      {/* The bundle JSON is usually too long for a QR: ConfirmTxKey shows the
          copyable text fallback past 1250 chars; relay delivery is primary. */}
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
        txid={txid}
        chain={txChain || activeChain}
      />
      <TxRejected open={openTxRejected} openAction={txRejectedAction} />
    </>
  );

  return {
    chainType: 'kas',
    headerTitle: state.swap ? t('home:swap.swap_crypto') : '',
    submitLabel: state.swap
      ? t('send:send_swap', {
          buyAsset: state.swap.buyAsset,
          buyAmount: new BigNumber(state.swap.buyAmount).toFixed(),
        })
      : t('send:send'),
    form,
    onFinish: (values) => {
      void onFinish(values as sendForm);
    },
    cancel: cancelSend,
    submitting,
    tokenSelect: null,
    receiver: {
      value: txReceiver,
      set: (value: string) => {
        setTxReceiver(value);
        form.setFieldValue('receiver', value);
      },
      disabled: !!state.swap,
      valid: !!txReceiver.trim() && receiverValidation.valid,
      showError: showReceiverError,
      errorText: showReceiverError
        ? receiverValidation.warningChainType
          ? t('send:err_wrong_chain_address', {
              chain: blockchainConfig.name,
            })
          : t('send:err_invalid_receiver')
        : null,
      qrEnabled: !state.swap,
    },
    amount: {
      value: sendingAmount,
      set: (value: string) => {
        setSendingAmount(value);
        setUseMaximum(false);
      },
      status: validateStatusAmount,
      suffix: blockchainConfig.symbol,
      disabled: !!state.swap,
      fiat: toFiat(sendingAmount),
      maxDisplay: maxAmount,
      onMax: () => setUseMaximum(true),
      maxDisabled: !!state.swap,
    },
    // Kaspa vault spends carry no payload.
    message: null,
    composeExtra: null,
    validateCompose: () => validateCompose() ?? planError,
    feePresets,
    selectedPreset: feePreset,
    selectPreset: (key: FeePresetKey) => {
      if (key !== 'custom') setFeePreset(key);
    },
    customFeeContent: null,
    hiddenFormContent: null,
    feeDisplay: txFee || '---',
    feeReady: !!txFee && !planError,
    feeSymbol: blockchainConfig.symbol,
    feeFiat: toFiat(txFee || null),
    feeRateDisplay: rate ? `${rate.toString()} sompi/g` : null,
    totalDisplay,
    totalFiat: toFiat(totalDisplay === '---' ? null : totalDisplay),
    isRBF: false,
    approveActive: openConfirmTx,
    pendingApproval,
    showPendingApproval: () => setOpenConfirmTx(true),
    modals,
  };
}
