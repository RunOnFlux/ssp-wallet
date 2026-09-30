/**
 * TRON send strategy hook — the stateful half of the TRON strategy.
 *
 * Modelled on useSolSendStrategy (relay-sponsored, key broadcasts), with every
 * chain operation in lib/tron.ts (@runonflux/tron-multisig), never utxolib:
 *   - Sponsored (default): POST /v1/tron/quote with the vault's signers and
 *     the transfer call → the Op is built from the QUOTED nonce, deadline and
 *     fee (TRX by default, USDT when the relay says so; both offered when both
 *     are possible), checked against the pinned fee collector and the consumer
 *     ceilings, and the wallet signs opDigest with its leaf.
 *   - "Pay network fee myself" (Advanced): fee = noFee(), nonce from the
 *     vault's on-chain nonceBitmap; SSP Key self-submits from its own leaf
 *     account, whose address and TRX balance are shown.
 *   - The wallet posts action 'tx' with the `ssp-tron-op` v1 payload
 *     (contract §3) and waits for the socket `txid` / `txrejected` of this
 *     chain; SSP Key verifies, co-signs and broadcasts.
 *   - Before any USDT send: the vault and the recipient are checked against
 *     the USDT blacklist (a blacklisted recipient is blocked, a frozen vault
 *     shows a banner); a first-time recipient needs an explicit confirmation
 *     with the address middle highlighted (contract §5.8, §5.9).
 *   - While the SDK has no deployment pinned (isTronLive false) nothing can be
 *     sent: the screen says "TRON vaults are not live yet".
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from '../../lib/toast';
import { useNavigate, useLocation } from 'react-router';
import { Alert, Checkbox, Form, Modal, Radio, Typography } from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import axios from 'axios';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { useSocket } from '../../hooks/useSocket';
import { getFingerprint } from '../../lib/fingerprint';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances';
import {
  TRON_TRX_FEE_TOKEN,
  TronError,
  buildSelfPayTronOp,
  buildSponsoredTronOp,
  fetchTronKeyAccount,
  isTronLive,
  isTronUsdtBlacklisted,
  nowSeconds,
  pickTronSelfPayNonce,
  requestTronQuote,
  signConsumerTronOp,
  tronCallsToJson,
  tronConsumerConfig,
  tronConsumerVault,
  tronNetwork,
  tronTransferCall,
  tronUnits,
  type TronQuote,
} from '../../lib/tron';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import HighlightedAddress from '../../components/HighlightedAddress/HighlightedAddress';
import {
  validateReceiverAddress,
  type AddressValidationResult,
} from '../../lib/addressValidation';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import type { Token } from '@storage/blockchains';
import { setContacts } from '../../store';
import {
  tronAmountExceedsBalance,
  tronFeeIsSendAsset,
  tronMaxSendable,
  tronSendErrorKey,
  tronUnitsToBase,
} from '../../lib/sendStrategies/tron';
import { parseAmount } from '../../lib/sendStrategies/amount';
import type { SendStrategyView, FeePresetView } from './types';

const { Text } = Typography;

interface LocationState {
  receiver?: string;
  amount?: string;
  contract?: string;
  paymentAction?: boolean;
}

interface tokenOption {
  label: string;
  value: string;
}

interface QuoteState {
  key: string;
  quote: TronQuote;
}

/** Quotes closer than this to their deadline are refreshed, never signed. */
const QUOTE_MIN_REMAINING_SECONDS = 120n;
const QUOTE_DEBOUNCE_MS = 500;

export function useTronSendStrategy(): SendStrategyView {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const {
    txid: socketTxid,
    clearTxid,
    txRejected: socketTxRejected,
    chain: socketChain,
    clearTxRejected,
  } = useSocket();
  const { t } = useTranslation(['send', 'common', 'home']);
  const tr = t as unknown as (
    key: string,
    opts?: Record<string, string>,
  ) => string;
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (s) => s.sspState,
  );
  const { createWkIdentityAuth } = useRelayAuth();
  const { wallets, walletInUse, xpubWallet, xpubKey, importedTokens } =
    useAppSelector((s) => s[activeChain]);
  const sender = wallets[walletInUse]?.address ?? '';
  const { contacts } = useAppSelector((s) => s.contacts);
  const { cryptoRates, fiatRates } = useAppSelector((s) => s.fiatCryptoRates);
  const { passwordBlob } = useAppSelector((s) => s.passwordBlob);
  const blockchainConfig = blockchains[activeChain];
  const live = isTronLive(activeChain);
  const browser = window.chrome || window.browser;
  const [typeIndex, addressIndex] = walletInUse.split('-').map(Number);

  const [txReceiver, setTxReceiver] = useState('');
  const [txToken, setTxToken] = useState(''); // '' = native TRX
  const [sendingAmount, setSendingAmount] = useState('0');
  const [useMaximum, setUseMaximum] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [usdtBalance, setUsdtBalance] = useState<bigint | null>(null);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [feeTokenChoice, setFeeTokenChoice] = useState<string | undefined>(
    undefined,
  );
  const [selfPay, setSelfPay] = useState(false);
  const [keyAccount, setKeyAccount] = useState<{
    address: string;
    balance: string;
  } | null>(null);
  const [vaultFrozen, setVaultFrozen] = useState(false);
  const [recipientConfirmOpen, setRecipientConfirmOpen] = useState(false);
  const [confirmedRecipient, setConfirmedRecipient] = useState('');

  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [txid, setTxid] = useState('');

  const usdtContract = useMemo(() => {
    try {
      return tronNetwork(activeChain).usdt ?? '';
    } catch {
      return '';
    }
  }, [activeChain]);

  // The vault's signers, from the wallet's own xpub and the key xpub stored
  // at pairing — never from the relay (contract §5.1).
  const vaultConfig = useMemo(() => {
    if (!xpubWallet || !xpubKey) return null;
    try {
      return tronConsumerConfig(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        activeChain,
      );
    } catch {
      return null;
    }
  }, [xpubWallet, xpubKey, typeIndex, addressIndex, activeChain]);

  const allTokens: Token[] = useMemo(
    () => blockchainConfig.tokens.concat(importedTokens ?? []),
    [blockchainConfig.tokens, importedTokens],
  );
  const nativeToken = blockchainConfig.tokens[0];
  const selectedToken =
    allTokens.find((tk) => tk.contract === txToken) ?? nativeToken;
  const assetDecimals = selectedToken.decimals;
  const amountBase = tronUnitsToBase(sendingAmount, assetDecimals);
  const receiverTrimmed = txReceiver.trim();
  const receiverValidation: AddressValidationResult = receiverTrimmed
    ? validateReceiverAddress(receiverTrimmed, activeChain)
    : { valid: false };
  const receiverValid = receiverValidation.valid;
  const inputKey = `${receiverTrimmed}|${txToken}|${amountBase?.toString() ?? ''}|${feeTokenChoice ?? ''}`;
  const assetBalance = txToken ? tokenBalance : nativeBalance;

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({ type, content });
  };

  const errorText = (error: unknown): string => {
    const key = tronSendErrorKey(error);
    if (key) return tr(key);
    return error instanceof Error ? error.message : t('send:err_s1');
  };

  const tokenMeta = (token: string): { symbol: string; decimals: number } => {
    if (token === TRON_TRX_FEE_TOKEN) {
      return {
        symbol: blockchainConfig.symbol,
        decimals: blockchainConfig.decimals,
      };
    }
    const tk = allTokens.find((x) => x.contract === token);
    return { symbol: tk?.symbol ?? token, decimals: tk?.decimals ?? 0 };
  };

  const rateFor = (symbol: string, native: boolean): number => {
    const key = (
      native ? activeChain : symbol.toLowerCase()
    ) as keyof typeof cryptoRates;
    const cr = cryptoRates[key] ?? 0;
    const fi = fiatRates[sspConfig().fiatCurrency] ?? 0;
    return cr * fi;
  };

  const toFiat = (
    units: string | null,
    symbol: string,
    native: boolean,
  ): string | null => {
    if (units === null) return null;
    const numeric = parseAmount(units || '0');
    if (!numeric || numeric.lte(0)) return null;
    const rate = rateFor(symbol, native);
    if (!rate) return null;
    return formatFiatWithSymbol(numeric.multipliedBy(rate));
  };

  // Prefill from navigation state (payment request / contacts).
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

  // Token list = native + activated whitelisted/imported TRC-20s.
  const tokenItems: tokenOption[] = useMemo(() => {
    const activated = (wallets[walletInUse]?.activatedTokens || []).slice();
    activated.push(nativeToken.contract);
    return allTokens
      .filter((tk) => activated.includes(tk.contract))
      .map((tk) => ({
        label: `${tk.name} (${tk.symbol})`,
        value: tk.contract,
      }));
  }, [allTokens, wallets, walletInUse, nativeToken.contract]);

  useEffect(() => {
    const initial =
      state.contract && allTokens.some((tk) => tk.contract === state.contract)
        ? state.contract
        : nativeToken.contract;
    setTxToken(initial);
    form.setFieldValue('asset', initial);
  }, [activeChain, state.contract]);

  // Balances: TRX, the selected token and USDT (a USDT fee needs it).
  const loadBalances = async () => {
    if (!sender || !live) return;
    try {
      const contracts = [txToken, usdtContract].filter(Boolean);
      const [native, tokens] = await Promise.all([
        fetchAddressBalance(sender, activeChain),
        contracts.length
          ? fetchAddressTokenBalances(sender, activeChain, contracts)
          : Promise.resolve([]),
      ]);
      setNativeBalance(BigInt(native.confirmed || '0'));
      const find = (c: string) =>
        BigInt(tokens.find((b) => b.contract === c)?.balance ?? '0');
      setTokenBalance(txToken ? find(txToken) : null);
      setUsdtBalance(usdtContract ? find(usdtContract) : null);
    } catch (error) {
      console.log('[SendTRON] balance fetch error', error);
    }
  };

  useEffect(() => {
    void loadBalances();
  }, [txToken, sender, activeChain, live, usdtContract]);

  // Frozen-vault banner: a USDT-blacklisted vault cannot move USDT.
  useEffect(() => {
    if (!live || !sender || !usdtContract) return;
    let cancelled = false;
    void isTronUsdtBlacklisted(sender, activeChain)
      .then((frozen) => {
        if (!cancelled) setVaultFrozen(frozen);
      })
      .catch((error) => console.log('[SendTRON] blacklist check', error));
    return () => {
      cancelled = true;
    };
  }, [live, sender, activeChain, usdtContract]);

  // Self-pay: show the key's own TRON account and its TRX balance.
  useEffect(() => {
    if (!selfPay || !live || !xpubKey) return;
    let cancelled = false;
    void fetchTronKeyAccount(xpubKey, typeIndex, addressIndex, activeChain)
      .then((account) => {
        if (!cancelled) setKeyAccount(account);
      })
      .catch((error) => console.log('[SendTRON] key account', error));
    return () => {
      cancelled = true;
    };
  }, [selfPay, live, xpubKey, typeIndex, addressIndex, activeChain]);

  // Sponsored quote for the current recipient/asset/amount (debounced). The
  // relay picks and reserves the nonce and sets the deadline (contract §4).
  useEffect(() => {
    if (!live || selfPay || !vaultConfig || !receiverValid || !amountBase) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const key = inputKey;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const calls = [
            tronTransferCall(txToken, receiverTrimmed, amountBase),
          ];
          const q = await requestTronQuote({
            chain: activeChain,
            signers: [...vaultConfig.signers],
            threshold: vaultConfig.threshold,
            calls: tronCallsToJson(calls),
            ...(feeTokenChoice ? { feeToken: feeTokenChoice } : {}),
          });
          if (cancelled) return;
          if (q.vault !== sender) {
            throw new TronError('VAULT_MISMATCH', 'Quote vault mismatch');
          }
          setQuote({ key, quote: q });
          setQuoteError(null);
        } catch (error) {
          if (cancelled) return;
          console.log('[SendTRON] quote error', error);
          setQuote(null);
          setQuoteError(errorText(error));
        } finally {
          if (!cancelled) setQuoteLoading(false);
        }
      })();
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [live, selfPay, vaultConfig, inputKey, sender, quoteRefresh]);

  const activeQuote =
    !selfPay && quote && quote.key === inputKey ? quote.quote : null;
  // The relay still returns the TRX fee terms when it will not sponsor this
  // Op (e.g. INSUFFICIENT_FEE_BALANCE…): explain it and offer self-pay, but
  // never build a sponsored Op from it.
  const sponsorUnavailable = !!activeQuote && !activeQuote.sponsorAvailable;
  const sponsorUnavailableText = activeQuote?.unavailableReason?.startsWith(
    'INSUFFICIENT_FEE_BALANCE',
  )
    ? t('send:tron_sponsor_insufficient_fee')
    : t('send:tron_sponsor_unavailable');
  // Only a quote SSP actually sponsors has a payable fee.
  const fee: { token: string; amount: bigint } | null = selfPay
    ? { token: TRON_TRX_FEE_TOKEN, amount: 0n }
    : activeQuote && !sponsorUnavailable
      ? {
          token: activeQuote.fee.token,
          amount: BigInt(activeQuote.fee.amount),
        }
      : null;
  const feeMeta = fee
    ? tokenMeta(fee.token)
    : { symbol: blockchainConfig.symbol, decimals: blockchainConfig.decimals };
  const feeUnits = fee ? tronUnits(fee.amount, feeMeta.decimals) : '';
  const feeTokenBalance = fee
    ? fee.token === TRON_TRX_FEE_TOKEN
      ? nativeBalance
      : fee.token === txToken
        ? tokenBalance
        : fee.token === usdtContract
          ? usdtBalance
          : null
    : null;

  const exceedsBalance =
    assetBalance !== null &&
    tronAmountExceedsBalance({
      amountBase,
      assetBalance,
      fee,
      assetContract: txToken,
      feeTokenBalance,
    });

  // Send-max: quote the whole balance and take the relay's maxSendable
  // (balance − fee for a same-asset fee, the full balance otherwise).
  useEffect(() => {
    if (!useMaximum || assetBalance === null) return;
    let cancelled = false;
    const setMax = (base: bigint) => {
      if (cancelled) return;
      const units = tronUnits(base, assetDecimals);
      setSendingAmount(units);
      form.setFieldValue('amount', units);
    };
    if (selfPay || !vaultConfig || !receiverValid || assetBalance === 0n) {
      setMax(assetBalance);
      return;
    }
    void (async () => {
      try {
        // Exactly one transfer of the full balance + `max` (contract §4):
        // the relay answers with maxSendable = balance − fee (same token).
        const q = await requestTronQuote({
          chain: activeChain,
          signers: [...vaultConfig.signers],
          threshold: vaultConfig.threshold,
          calls: tronCallsToJson([
            tronTransferCall(txToken, receiverTrimmed, assetBalance),
          ]),
          ...(feeTokenChoice ? { feeToken: feeTokenChoice } : {}),
          max: { token: txToken || 'TRX' },
        });
        setMax(
          tronMaxSendable({
            balance: assetBalance,
            assetContract: txToken,
            fee: { token: q.fee.token, amount: BigInt(q.fee.amount) },
            ...(q.maxSendable ? { maxSendable: q.maxSendable } : {}),
          }),
        );
      } catch (error) {
        console.log('[SendTRON] max quote error', error);
        setMax(
          tronMaxSendable({
            balance: assetBalance,
            assetContract: txToken,
            fee,
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useMaximum, assetBalance, txToken, selfPay, receiverTrimmed]);

  // Socket-delivered txid (SSP Key broadcast through the relay sponsor, or
  // self-submitted) — filtered by chain.
  useEffect(() => {
    if (socketTxid && socketChain === activeChain) {
      setTxid(socketTxid);
      setOpenConfirmTx(false);
      setPendingApproval(false);
      setSubmitting(false);
      clearTxid?.();
      if (state.paymentAction) {
        payRequestAction({
          status: 'SUCCESS', // do not translate
          data: t('home:payment_request.transaction_sent'),
          txid: socketTxid,
        });
      }
      setOpenTxSent(true);
      void loadBalances();
    }
  }, [socketTxid, socketChain, activeChain]);

  useEffect(() => {
    if (socketTxRejected && socketChain === activeChain) {
      setOpenConfirmTx(false);
      setPendingApproval(false);
      setSubmitting(false);
      clearTxRejected?.();
      if (state.paymentAction) {
        payRequestAction(null);
      }
      setOpenTxRejected(true);
    }
  }, [socketTxRejected, socketChain, activeChain]);

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
    } catch (error) {
      console.warn('[SendTRON postAction] auth unavailable', error);
    }
    await axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  const isKnownRecipient = (receiver: string): boolean => {
    // Case-sensitive: base58.
    if (contacts[activeChain]?.some((c) => c.address === receiver)) {
      return true;
    }
    return Object.keys(wallets).some((w) => wallets[w].address === receiver);
  };

  // Address poisoning (contract §5.8): a DIFFERENT address that shares the
  // first and last 4 characters with a contact or one of our own addresses.
  const lookalikeOf = (receiver: string): string | null => {
    if (receiver.length < 12) return null;
    const known = [
      ...(contacts[activeChain] ?? []).map((c) => c.address),
      ...Object.keys(wallets).map((w) => wallets[w].address),
    ];
    return (
      known.find(
        (a) =>
          !!a &&
          a !== receiver &&
          a.slice(0, 4) === receiver.slice(0, 4) &&
          a.slice(-4) === receiver.slice(-4),
      ) ?? null
    );
  };
  const lookalike = receiverValid ? lookalikeOf(receiverTrimmed) : null;

  const saveContact = (receiver: string) => {
    if (isKnownRecipient(receiver)) return;
    const adjContacts = [
      ...(contacts[activeChain] ?? []),
      { id: new Date().getTime(), name: '', address: receiver },
    ];
    const completeContacts = { ...contacts, [activeChain]: adjContacts };
    dispatch(setContacts(completeContacts));
    void localForage
      .setItem('contacts', completeContacts)
      .catch((error) => console.log(error));
  };

  const validateCompose = (): string | null => {
    if (!live) return t('send:err_tron_not_live');
    if (!receiverValid) {
      return receiverValidation.warningChainType
        ? t('send:err_wrong_chain_address', { chain: blockchainConfig.name })
        : t('send:err_invalid_receiver');
    }
    if (!amountBase) return t('send:err_invalid_amount');
    if (vaultFrozen && usdtContract && txToken === usdtContract) {
      return t('send:err_tron_vault_frozen');
    }
    if (!selfPay && sponsorUnavailable) return sponsorUnavailableText;
    if (exceedsBalance) return t('send:err_amount_exceeds_balance');
    if (!selfPay && quoteError) return quoteError;
    return null;
  };

  /** `confirmed`: the recipient the user just confirmed in the modal. */
  const onFinish = async (confirmed?: string) => {
    const composeError = validateCompose();
    if (composeError) {
      displayMessage('error', composeError);
      return;
    }
    if (!xpubWallet || !xpubKey || !vaultConfig || !amountBase) {
      displayMessage('error', t('send:err_invalid_xpriv'));
      return;
    }
    if (submitting) return;
    const receiver = receiverTrimmed;
    // First send to this address: explicit confirmation with the highlighted
    // address (address-poisoning defence, contract §5.8).
    if (
      !isKnownRecipient(receiver) &&
      confirmedRecipient !== receiver &&
      confirmed !== receiver
    ) {
      setRecipientConfirmOpen(true);
      return;
    }
    // What the user reviewed: the quote for exactly these inputs.
    const reviewedQuote = activeQuote;
    if (!selfPay && !reviewedQuote) {
      displayMessage('error', quoteError ?? t('send:err_tron_quote_failed'));
      return;
    }
    setSubmitting(true);
    const wInUse = walletInUse;
    let password: string | null = null;
    let xprivChain: string | null = null;
    let privKey = '';
    try {
      // Derive, never trust: our vault from our xpub + the paired key xpub.
      const vault = tronConsumerVault(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        activeChain,
      );
      if (vault.address !== sender) {
        throw new TronError('VAULT_MISMATCH', 'Vault mismatch');
      }
      const isUsdtSend = !!usdtContract && txToken === usdtContract;
      const isUsdtFee = !selfPay && reviewedQuote?.fee.token === usdtContract;
      // USDT blacklist (contract §5.9): funds sent to a blacklisted account
      // freeze; a blacklisted vault cannot send USDT (it would revert).
      if (isUsdtSend || isUsdtFee) {
        if (await isTronUsdtBlacklisted(sender, activeChain)) {
          setVaultFrozen(true);
          throw new TronError('VAULT_FROZEN', 'Vault is blacklisted');
        }
      }
      if (isUsdtSend && (await isTronUsdtBlacklisted(receiver, activeChain))) {
        throw new TronError('RECIPIENT_BLACKLISTED', 'Recipient blacklisted');
      }

      const calls = [tronTransferCall(txToken, receiver, amountBase)];
      let op;
      if (selfPay) {
        const nonce = await pickTronSelfPayNonce(sender, activeChain);
        op = buildSelfPayTronOp({ calls, nonce });
      } else {
        const q = reviewedQuote!;
        if (BigInt(q.deadline) - nowSeconds() < QUOTE_MIN_REMAINING_SECONDS) {
          setQuoteRefresh((n) => n + 1);
          throw new TronError('QUOTE_EXPIRED', 'Quote expired');
        }
        op = buildSponsoredTronOp({
          chain: activeChain,
          vault: sender,
          calls,
          quote: q,
        });
      }

      // Fresh balances: never post a spend the vault cannot fund.
      const freshNative = BigInt(
        (await fetchAddressBalance(sender, activeChain)).confirmed || '0',
      );
      const contracts = [txToken, usdtContract].filter(Boolean);
      const freshTokens = contracts.length
        ? await fetchAddressTokenBalances(sender, activeChain, contracts)
        : [];
      const freshOf = (c: string) =>
        BigInt(freshTokens.find((b) => b.contract === c)?.balance ?? '0');
      const freshAsset = txToken ? freshOf(txToken) : freshNative;
      const feeUsed = { token: op.fee.token, amount: op.fee.amount };
      const freshFeeBalance =
        feeUsed.token === TRON_TRX_FEE_TOKEN
          ? freshNative
          : tronFeeIsSendAsset(feeUsed.token, txToken)
            ? freshAsset
            : freshOf(feeUsed.token);
      if (
        tronAmountExceedsBalance({
          amountBase,
          assetBalance: freshAsset,
          fee: feeUsed,
          assetContract: txToken,
          feeTokenBalance: freshFeeBalance,
        })
      ) {
        void loadBalances();
        throw new Error(t('send:err_amount_exceeds_balance'));
      }

      // Only now decrypt and derive the wallet leaf key.
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
      const { payload } = signConsumerTronOp({
        chain: activeChain,
        config: vault.config,
        vault: vault.address,
        op,
        privKeyHex: privKey,
      });
      privKey = '';
      await postAction(
        'tx',
        payload,
        activeChain,
        wInUse,
        sspWalletKeyInternalIdentity,
      );
      setTxHex(payload);
      setSubmitting(false);
      setPendingApproval(true);
      setOpenConfirmTx(true);
      saveContact(receiver);
    } catch (error) {
      setSubmitting(false);
      console.log(error);
      displayMessage('error', errorText(error));
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

  const cancelSend = () => {
    if (state.paymentAction) {
      payRequestAction(null);
    }
    navigate('/home');
  };

  const isNativeAsset = !txToken;
  const showReceiverError = !!receiverTrimmed && !receiverValid;
  // Total only when the fee is paid in the asset being sent (SendFlow shows
  // it with feeSymbol); a USDT send with a TRX fee has no single total.
  const totalDisplay =
    fee && amountBase && tronFeeIsSendAsset(fee.token, txToken)
      ? tronUnits(amountBase + fee.amount, assetDecimals)
      : null;
  const feeIsNative = !fee || fee.token === TRON_TRX_FEE_TOKEN;

  const feeOptions = (activeQuote?.feeOptions ?? []).filter(
    (o) => o.token === TRON_TRX_FEE_TOKEN || o.token === usdtContract,
  );
  const usdtFeeSelected =
    !!activeQuote && activeQuote.fee.token === usdtContract;

  const feeOptionLabel = (o: { token: string; amount: string }) => {
    const meta = tokenMeta(o.token);
    const units = tronUnits(o.amount, meta.decimals);
    const fiat = toFiat(units, meta.symbol, o.token === TRON_TRX_FEE_TOKEN);
    return `${units} ${meta.symbol}${fiat ? ` ≈ ${fiat}` : ''}`;
  };

  const feeSection = (
    <div>
      {!live ? (
        <Text type="secondary">{t('send:tron_not_live_desc')}</Text>
      ) : selfPay ? (
        <div>
          <div>{t('send:tron_self_pay_desc')}</div>
          {keyAccount && (
            <div style={{ marginTop: 6 }}>
              {t('send:tron_self_pay_key_account')}:{' '}
              <HighlightedAddress address={keyAccount.address} />
              <div>
                {t('send:tron_self_pay_key_balance', {
                  amount: tronUnits(keyAccount.balance, 6),
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {!activeQuote ? (
            <Text type="secondary">
              {quoteLoading
                ? t('send:tron_fee_loading')
                : (quoteError ?? t('send:tron_fee_enter_details'))}
            </Text>
          ) : feeOptions.length > 1 ? (
            <div>
              <div style={{ marginBottom: 4 }}>{t('send:tron_fee_pay_in')}</div>
              <Radio.Group
                value={activeQuote.fee.token}
                onChange={(e) => setFeeTokenChoice(e.target.value as string)}
              >
                {feeOptions.map((o) => (
                  <Radio key={o.token} value={o.token}>
                    {feeOptionLabel(o)}
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          ) : (
            <div>{feeOptionLabel(activeQuote.fee)}</div>
          )}
          {sponsorUnavailable && (
            <div style={{ marginTop: 6 }}>
              <Text type="danger">{sponsorUnavailableText}</Text>
              {activeQuote?.unavailableReason ? (
                <div>
                  <Text type="secondary">
                    {t('send:tron_sponsor_reason', {
                      reason: activeQuote.unavailableReason,
                    })}
                  </Text>
                </div>
              ) : null}
            </div>
          )}
          {activeQuote && !activeQuote.deployed && (
            <div style={{ marginTop: 6 }}>
              <Text type="secondary">{t('send:tron_first_send_note')}</Text>
            </div>
          )}
          {(usdtFeeSelected || (!!activeQuote && feeOptions.length > 1)) && (
            <div style={{ marginTop: 6 }}>
              <Text type="secondary">{t('send:tron_keep_trx_hint')}</Text>
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <Text type="secondary">{t('send:tron_fee_explainer')}</Text>
          </div>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <Checkbox
          checked={selfPay}
          disabled={!live}
          onChange={(e) => setSelfPay(e.target.checked)}
        >
          {t('send:tron_self_pay_toggle')}
        </Checkbox>
      </div>
    </div>
  );

  const composeExtra = (
    <>
      {!live && (
        <Alert
          type="warning"
          showIcon
          message={t('send:tron_not_live_title')}
          description={t('send:tron_not_live_desc')}
          style={{ textAlign: 'left', marginBottom: 12 }}
        />
      )}
      {live && lookalike && (
        <Alert
          type="error"
          showIcon
          message={t('send:tron_lookalike_warning', { known: lookalike })}
          style={{ textAlign: 'left', marginBottom: 12 }}
        />
      )}
      {live && vaultFrozen && (
        <Alert
          type="error"
          showIcon
          message={t('send:tron_vault_frozen_banner')}
          style={{ textAlign: 'left', marginBottom: 12 }}
        />
      )}
    </>
  );

  const feePresets: FeePresetView[] = [
    { key: 'normal', feeAmount: fee ? feeUnits : null },
  ];

  const modals = (
    <>
      <ConfirmTxKey
        open={openConfirmTx}
        openAction={(status: boolean) => setOpenConfirmTx(status)}
        txHex={txHex}
        chain={activeChain}
        wallet={walletInUse}
      />
      <TxSent
        open={openTxSent}
        openAction={(status: boolean) => {
          setOpenTxSent(status);
          if (status === false) navigate('/home');
        }}
        txid={txid}
        chain={activeChain}
      />
      <TxRejected
        open={openTxRejected}
        openAction={(status: boolean) => setOpenTxRejected(status)}
      />
      <Modal
        open={recipientConfirmOpen}
        title={t('send:tron_new_recipient_title')}
        okText={t('send:tron_new_recipient_confirm')}
        cancelText={t('common:cancel')}
        onCancel={() => setRecipientConfirmOpen(false)}
        onOk={() => {
          setConfirmedRecipient(receiverTrimmed);
          setRecipientConfirmOpen(false);
          void onFinish(receiverTrimmed);
        }}
      >
        <p>{t('send:tron_new_recipient_desc')}</p>
        {lookalike ? (
          <p>
            <Text type="danger">
              {t('send:tron_lookalike_warning', { known: lookalike })}
            </Text>
          </p>
        ) : null}
        <div style={{ fontSize: 14 }}>
          <HighlightedAddress address={receiverTrimmed} />
        </div>
      </Modal>
    </>
  );

  return {
    chainType: 'tron',
    headerTitle: '',
    submitLabel: t('send:send'),
    form,
    onFinish: () => {
      void onFinish();
    },
    cancel: cancelSend,
    submitting,
    tokenSelect: {
      items: tokenItems,
      value: txToken,
      onChange: (value: string) => {
        setTxToken(value);
        setFeeTokenChoice(undefined);
        setUseMaximum(false);
      },
      disabled: !live,
    },
    receiver: {
      value: txReceiver,
      set: (value: string) => {
        setTxReceiver(value);
        form.setFieldValue('receiver', value);
      },
      disabled: !live,
      valid: !!receiverTrimmed && receiverValid,
      showError: showReceiverError,
      errorText: showReceiverError
        ? receiverValidation.warningChainType
          ? t('send:err_wrong_chain_address', {
              chain: blockchainConfig.name,
            })
          : t('send:err_invalid_receiver')
        : null,
      qrEnabled: live,
    },
    amount: {
      value: sendingAmount,
      set: (value: string) => {
        setSendingAmount(value);
        setUseMaximum(false);
      },
      status: exceedsBalance ? 'error' : 'success',
      suffix: selectedToken.symbol,
      disabled: !live,
      fiat: toFiat(sendingAmount, selectedToken.symbol, isNativeAsset),
      maxDisplay:
        assetBalance === null ? '0' : tronUnits(assetBalance, assetDecimals),
      onMax: () => setUseMaximum(true),
      maxDisabled: !live,
    },
    // A TRON vault Op carries no memo.
    message: null,
    composeExtra,
    validateCompose,
    feeSection,
    feeLabel: selfPay ? t('send:tron_fee_self') : t('send:tron_fee_sponsored'),
    receiverReview: receiverTrimmed ? (
      <HighlightedAddress address={receiverTrimmed} />
    ) : null,
    feePresets,
    selectedPreset: 'normal',
    // One fee "preset": the quote (the fee token / self-pay live in feeSection).
    selectPreset: () => undefined,
    customFeeContent: null,
    hiddenFormContent: null,
    feeDisplay: fee ? feeUnits : '---',
    feeReady:
      live &&
      !!vaultConfig &&
      (selfPay || (!!activeQuote && !quoteLoading && !sponsorUnavailable)),
    feeSymbol: feeMeta.symbol,
    feeFiat: fee ? toFiat(feeUnits, feeMeta.symbol, feeIsNative) : null,
    feeRateDisplay: null,
    totalDisplay,
    totalFiat: totalDisplay
      ? toFiat(totalDisplay, selectedToken.symbol, isNativeAsset)
      : null,
    isRBF: false,
    approveActive: openConfirmTx,
    pendingApproval,
    showPendingApproval: () => setOpenConfirmTx(true),
    modals,
  };
}
