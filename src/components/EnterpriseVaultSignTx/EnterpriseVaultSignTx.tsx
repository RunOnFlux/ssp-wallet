import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Typography, Button, Space, Modal, Spin, Alert, Divider } from 'antd';
import { useAppSelector } from '../../hooks';
import './EnterpriseVaultSignTx.css';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { useSocket } from '../../hooks/useSocket';
import HandshakeAnimation from '../HandshakeAnimation/HandshakeAnimation';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import {
  getMasterXpriv,
  generateAddressKeypair,
  getScriptType,
  deriveEVMPublicKey,
} from '../../lib/wallet';
import { signVaultMessageWithSchnorr } from '../../lib/evmSigning';
import {
  userOpHashMatches,
  messageDigestMatches,
} from '../../lib/userOpVerify';
import {
  decodeVaultTransaction,
  type VaultDecodedTx,
} from '../../lib/transactions';
import VaultRiskStrip from './VaultRiskStrip';
import {
  parseProposalSimulation,
  type ProposalSimulation,
  type SimWarning,
} from '../../types/simulation';
import {
  detectDecodeMismatch,
  buildDecodeMismatchWarning,
} from '../../lib/simulationMismatch';
import type { VaultSolDecodeResult } from '../../lib/vaultSolanaDecode';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import axios from 'axios';
import utxolib from '@runonflux/utxo-lib';
import { Buffer } from 'buffer';
import { getLibId } from '../../lib/constructTx';

import { useTranslation } from 'react-i18next';
import { generateRequestId } from '../../lib/wkSign';
import {
  consumeEnterpriseNonceForPartial,
  EnterpriseNonceError,
} from '../../lib/enterpriseNonces';
import { normalizeVaultUserOp } from '../../lib/vaultUserOp';
import {
  assertEnterpriseIndices,
  enterpriseIndicesError,
  inputAddressIndex,
} from '../../lib/enterpriseIndexGuard';
import { attachRequiredWkAuth } from '../../lib/relayRequestAuth';
import {
  sighashOmitsInputAmounts,
  verifyUtxoInputValues,
} from '../../lib/prevoutVerify';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import type { cryptos } from '../../types';
import { useVaultDescriptorGate } from '../../hooks/useVaultDescriptorGate';
import { VaultDescriptorError } from '../../lib/vaultDescriptor';
import {
  checkEvmSignerKeysAgainstDescriptor,
  checkVaultSignRequest,
  type VaultSignCheck,
} from '../../lib/vaultDescriptorDerive';
import {
  VAULT_ERROR_CODES,
  keyRejectionRequestId,
  vaultErrorCodeFromKey,
  vaultGateErrorCode,
} from '../../lib/vaultGate';
import { ownVaultAccountXpubFromXpriv } from '../../lib/vaultOwnXpub';
import { buildVaultSignRelayPayload } from '../../lib/vaultRelayPayload';
import VaultPinConfirm from '../VaultPinConfirm/VaultPinConfirm';
import VaultDescriptorStatus from '../VaultPinConfirm/VaultDescriptorStatus';

const { Text } = Typography;

interface Recipient {
  address: string;
  amount: string; // in base units (satoshis / wei)
}

interface EnterpriseVaultSignTxResponse {
  walletSignatures: string[];
  keySignatures: string[];
  walletPubKey: string;
  keyPubKey: string;
  wkIdentity: string;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  // UTXO progressive signing: fully signed TX hex from Key (both wallet+key SIGHASH sigs)
  signedHex?: string;
}

interface EnterpriseVaultSignTxData {
  status: string;
  result?: EnterpriseVaultSignTxResponse;
  data?: string;
  errorCode?: string;
}

interface ReservedNonce {
  kPublic: string;
  kTwoPublic: string;
}

interface Props {
  open: boolean;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  recipients: string; // JSON string of Recipient[]
  fee: string;
  memo: string;
  rawUnsignedTx: string;
  inputDetails: string; // JSON string of input details
  vaultName: string;
  orgName: string;
  requesterInfo?: WkSignRequesterInfo | null;
  openAction?: (data: EnterpriseVaultSignTxData | null) => void;
  // EVM enterprise nonces for Schnorr signing
  reservedNonce?: ReservedNonce; // Wallet's nonce (consumed locally)
  reservedKeyNonce?: ReservedNonce; // Key's nonce (forwarded to Key for signing)
  keyXpub?: string; // Key's vault xpub for EVM Schnorr pubkey derivation
  // EVM M-of-N: all 2M public keys and nonces in canonical order
  allSignerKeys?: string[];
  allSignerNonces?: Array<{ kPublic: string; kTwoPublic: string }>;
  // ERC-20 token metadata (EVM only, omit for native currency)
  tokenContract?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  // Source vault address for display on Key
  sourceAddress?: string;
  // Full EVM UserOp struct (JSON string) for trustless decode
  evmUserOp?: string;
  // Vault signing mode (dual, key_only, wallet_only)
  signingMode?: string;
  // Server-computed advisory transaction simulation (JSON string).
  // DISPLAY-ONLY — never gates signing. The device decode stays authoritative.
  simulation?: string;
  // Enterprise proposal references — included in the relay action payload so
  // the relay registers the signature server-side (durable even when this
  // tab's response never reaches the requesting page).
  proposalRefs?: { orgId: string; vaultId: string; proposalId: string };
  // WalletConnect Phase 2 — vault MESSAGE signing (personal_sign). When set, the
  // component signs `rawUnsignedTx` (the EIP-191 message digest) exactly as it
  // signs a UserOp hash, but shows the message text instead of a tx decode and
  // never involves recipients/fees. dappOrigin is the requesting dApp (display).
  signMessage?: string;
  dappOrigin?: string;
  // VD: the vault's signer set as SSP Enterprise fetched it from the relay
  // (verified + pinned here, forwarded verbatim to SSP Key) and its hash.
  vaultDescriptor?: unknown;
  vaultDescriptorHash?: string;
}

/**
 * Format a base-unit amount to human-readable using chain decimals.
 */
function formatAmount(amount: string, decimals: number): string {
  try {
    const raw = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const wholePart = raw / divisor;
    const fracPart = raw % divisor;
    if (fracPart === 0n) {
      return wholePart.toString();
    }
    const fracStr = fracPart.toString().padStart(decimals, '0');
    // Trim trailing zeros
    const trimmed = fracStr.replace(/0+$/, '');
    return `${wholePart}.${trimmed}`;
  } catch {
    return amount;
  }
}

function EnterpriseVaultSignTx({
  open,
  chain,
  orgIndex,
  vaultIndex,
  recipients: recipientsJson,
  fee,
  memo,
  rawUnsignedTx,
  inputDetails: inputDetailsJson,
  vaultName,
  orgName,
  requesterInfo,
  openAction,
  reservedNonce,
  reservedKeyNonce,
  keyXpub,
  allSignerKeys,
  allSignerNonces,
  tokenContract,
  tokenSymbol,
  tokenDecimals,
  sourceAddress,
  evmUserOp,
  signingMode,
  simulation: simulationJson,
  proposalRefs,
  signMessage,
  dappOrigin,
  vaultDescriptor,
  vaultDescriptorHash,
}: Props) {
  const { t } = useTranslation(['home', 'common']);
  // WalletConnect Phase 2: message-signing mode (vs the default transaction mode).
  const isMessageSign = !!signMessage;
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { createWkIdentityAuth, isAuthAvailable } = useRelayAuth();
  const {
    enterpriseVaultSigned,
    clearEnterpriseVaultSigned,
    enterpriseVaultSignRejected,
    clearEnterpriseVaultSignRejected,
  } = useSocket();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletSignatures, setWalletSignatures] = useState<string[] | null>(
    null,
  );
  const [walletPubKey, setWalletPubKey] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const signingRef = useRef(false);
  // Store wallet's Schnorr challenge for wallet-only mode (Key returns empty challenge)
  const walletChallengeRef = useRef<string>('');

  // Parse recipients from JSON
  const parsedRecipients = useMemo((): Recipient[] => {
    try {
      const parsed: unknown = JSON.parse(recipientsJson);
      if (Array.isArray(parsed)) {
        return parsed as Recipient[];
      }
      return [];
    } catch {
      return [];
    }
  }, [recipientsJson]);

  // Parse input details from JSON
  const parsedInputDetails = useMemo((): unknown[] => {
    try {
      const parsed: unknown = JSON.parse(inputDetailsJson);
      if (Array.isArray(parsed)) {
        return parsed as unknown[];
      }
      return [];
    } catch {
      return [];
    }
  }, [inputDetailsJson]);

  const chainConfig = chain ? blockchains[chain] : null;
  const chainDecimals = chainConfig?.decimals ?? 8;
  const chainSymbol = chainConfig?.symbol ?? chain.toUpperCase();
  const isSolChain = chainConfig?.chainType === 'sol';
  const isEvmChain = chainConfig?.chainType === 'evm';

  // H-1 (defence in depth): enterprise derivation indices are re-checked on
  // this screen (receipt) and again in handleSign. orgIndex outside 100-99999
  // would derive consumer (0') or recovery (99') keys.
  const indexError = useMemo(() => {
    try {
      return enterpriseIndicesError({
        orgIndex,
        vaultIndex,
        addressIndexes: parsedInputDetails.map((input) =>
          inputAddressIndex(input),
        ),
      });
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid address index';
    }
  }, [orgIndex, vaultIndex, parsedInputDetails]);

  // H-15: ONE normalised user operation — decoded for display AND hashed for
  // the binding check. Payloads with both shapes are refused.
  const normalizedUserOp = useMemo(
    () => (isEvmChain && evmUserOp ? normalizeVaultUserOp(evmUserOp) : null),
    [isEvmChain, evmUserOp],
  );

  // VD-3: verify the vault's signer set and apply the TOFU pin before anything
  // about this request is trusted. Nothing is signable until it is verified.
  const vaultGate = useVaultDescriptorGate({
    open,
    descriptor: vaultDescriptor,
    descriptorHash: vaultDescriptorHash,
    request: { chain, orgIndex, vaultIndex, signingMode },
    vaultName,
  });
  const verifiedVault =
    vaultGate.state.status === 'verified' ? vaultGate.state.verified : null;

  // Solana trustless decode — async (dynamic import of @solana/web3.js, and an
  // RPC fetch of the on-chain proposal for approve-only txs), so it lives in
  // state rather than the sync useMemo below. null = decode in progress (Sign
  // stays disabled until it resolves — fail-closed).
  const [solDecodeState, setSolDecodeState] =
    useState<VaultSolDecodeResult | null>(null);

  useEffect(() => {
    if (!isSolChain || !rawUnsignedTx) {
      setSolDecodeState(null);
      return;
    }
    let cancelled = false;
    setSolDecodeState(null);
    void (async () => {
      // decodeVaultSolTransaction never throws/rejects — failures map to a
      // result with decoded.error set, which blocks signing below.
      const { decodeVaultSolTransaction } =
        await import('../../lib/vaultSolanaDecode');
      const result = await decodeVaultSolTransaction(
        rawUnsignedTx,
        chain as keyof cryptos,
        {
          recipients: parsedRecipients,
          // The relay's mint is only an EXPECTATION compared against the
          // bytes; decimals/symbol are never taken from the relay (H-14).
          tokenMint: tokenContract,
        },
      );
      if (!cancelled) {
        setSolDecodeState(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSolChain, rawUnsignedTx, chain, parsedRecipients, tokenContract]);

  // HARD BLOCK (fail closed, H-13): bytes that contradict the relay payload,
  // undecodable bytes, and approve-only transactions that could not be
  // verified against the on-chain proposal are never signed.
  const solSignBlocked =
    !!solDecodeState &&
    (solDecodeState.mismatch || !!solDecodeState.decoded.error);
  const solDecodePending = isSolChain && !solDecodeState;

  // UTXO-5: DOGE/RVN signatures do not commit to input amounts, so the
  // relay-supplied inputDetails amounts (which drive the fee shown below) are
  // verified against each input's hash-checked previous transaction before
  // Sign is enabled.
  const needsPrevoutCheck =
    !!chain &&
    !isEvmChain &&
    !isSolChain &&
    !isMessageSign &&
    sighashOmitsInputAmounts(chain as keyof cryptos);
  const [prevoutCheck, setPrevoutCheck] = useState<
    | { status: 'pending' }
    | { status: 'ok' }
    | { status: 'error'; error: string }
  >({ status: 'pending' });

  useEffect(() => {
    if (!needsPrevoutCheck || !rawUnsignedTx) {
      setPrevoutCheck({ status: 'ok' });
      return;
    }
    let cancelled = false;
    setPrevoutCheck({ status: 'pending' });
    void (async () => {
      try {
        const network = utxolib.networks[getLibId(chain as keyof cryptos)];
        const tx = utxolib.Transaction.fromHex(rawUnsignedTx, network);
        if (tx.ins.length !== parsedInputDetails.length) {
          throw new Error('Input details do not match the transaction inputs');
        }
        const refs = tx.ins.map(
          (input: { hash: Uint8Array; index: number }, i: number) => {
            const claimed = (parsedInputDetails[i] as { amount?: unknown })
              ?.amount;
            if (typeof claimed !== 'string' && typeof claimed !== 'number') {
              throw new Error(`Input ${i} has no amount`);
            }
            return {
              txid: Buffer.from(input.hash).reverse().toString('hex'),
              vout: input.index,
              satoshis: String(claimed),
            };
          },
        );
        await verifyUtxoInputValues(chain as keyof cryptos, refs);
        if (!cancelled) setPrevoutCheck({ status: 'ok' });
      } catch (error) {
        if (!cancelled) {
          setPrevoutCheck({
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'Input amounts could not be verified',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsPrevoutCheck, rawUnsignedTx, chain, parsedInputDetails]);

  // Independently decode raw transaction — trustless verification
  // For EVM: rawUnsignedTx is a hash (not decodable), use evmUserOp JSON instead
  // For UTXO: rawUnsignedTx is the actual TX hex
  const decodedTx = useMemo((): VaultDecodedTx | null => {
    if (!chain) return null;
    if (isEvmChain) {
      if (!normalizedUserOp) {
        return null;
      }
      if (!normalizedUserOp.ok) {
        return {
          sender: '',
          recipients: [],
          fee: '0',
          error: normalizedUserOp.error,
        };
      }
      // Decode the SAME object that handleSign hashes (H-15). The decoder
      // fails closed on anything that is not a plain transfer (H-16, C-4).
      return decodeVaultTransaction(
        JSON.stringify({ userOpRequest: normalizedUserOp.op }),
        chain as keyof cryptos,
      );
    }
    if (isSolChain) {
      // Solana: trustless byte-level decode (create bundle) or on-chain
      // proposal decode (approve-only). null while decoding. A blocked
      // result carries decoded.error.
      if (!solDecodeState) return null;
      return solDecodeState.decoded;
    }
    // UTXO: decode from raw TX hex
    if (!rawUnsignedTx) return null;
    const inputAmounts = parsedInputDetails.map((input) => {
      const inp = input as { amount?: string };
      return inp.amount || '0';
    });
    // Pass first input's scripts so sender address can be derived even from unsigned TXs
    const firstInput = parsedInputDetails[0] as
      | {
          witnessScript?: string;
          redeemScript?: string;
        }
      | undefined;
    return decodeVaultTransaction(
      rawUnsignedTx,
      chain as keyof cryptos,
      inputAmounts,
      [],
      firstInput,
    );
  }, [
    rawUnsignedTx,
    chain,
    isEvmChain,
    isSolChain,
    parsedInputDetails,
    normalizedUserOp,
    solDecodeState,
  ]);

  // VD-4: re-derive what this request spends from (UTXO input scripts and
  // change, EVM sender, Solana multisig/vault PDA) from the verified vault.
  // null = not yet checkable (vault or Solana decode still pending).
  const vaultSignCheckInput = useMemo(
    () => ({
      isMessageSign,
      rawUnsignedTx,
      inputDetails: parsedInputDetails,
      evmSender: normalizedUserOp?.ok ? normalizedUserOp.op.sender : undefined,
      solMultisigPda: solDecodeState?.multisigPda,
      solVaultPda: solDecodeState?.decoded.sender || undefined,
    }),
    [
      isMessageSign,
      rawUnsignedTx,
      parsedInputDetails,
      normalizedUserOp,
      solDecodeState,
    ],
  );
  const vaultCheck = useMemo(():
    | { ok: true; result: VaultSignCheck }
    | { ok: false; error: string }
    | null => {
    if (!verifiedVault) return null;
    if (isSolChain && !isMessageSign && !solDecodeState) return null;
    try {
      return {
        ok: true,
        result: checkVaultSignRequest(
          verifiedVault.descriptor,
          vaultSignCheckInput,
        ),
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Vault derivation failed',
      };
    }
  }, [
    verifiedVault,
    isSolChain,
    isMessageSign,
    solDecodeState,
    vaultSignCheckInput,
  ]);
  const vaultCheckError =
    vaultCheck && !vaultCheck.ok ? vaultCheck.error : null;
  const vaultUtxo = vaultCheck?.ok ? vaultCheck.result.utxo : undefined;
  const vaultGateError =
    vaultGate.state.status === 'error' ? vaultGate.state : null;
  const vaultPending =
    !vaultGateError && (!verifiedVault || vaultCheck === null);
  // UTXO: recipients and change as classified against the derived vault
  // addresses (falls back to the decoder's list until the vault verified,
  // while Sign is still disabled).
  const displayRecipients = vaultUtxo
    ? vaultUtxo.outputs
        .filter((output) => output.vaultAddressIndex === null)
        .map(({ address, amount }) => ({ address, amount }))
    : (decodedTx?.recipients ?? []);
  const changeOutputs = vaultUtxo
    ? vaultUtxo.outputs.filter((output) => output.vaultAddressIndex !== null)
    : [];

  // Token display (H-14): decimals/symbol only from this device's token list
  // (or the signed Solana bytes); an unknown token is shown in raw base units
  // next to its contract/mint with an "unverified token" banner.
  const isTokenTx = !!decodedTx?.tokenContract && !decodedTx?.error;
  const tokenUnverified = isTokenTx && decodedTx?.tokenVerified !== true;
  const displayDecimals: number | undefined = isTokenTx
    ? decodedTx?.tokenDecimals
    : chainDecimals;
  const displaySymbol = isTokenTx
    ? decodedTx?.tokenSymbol || t('home:enterpriseVaultSignTx.unknown_token')
    : chainSymbol;
  const renderAmount = (amount: string): string =>
    displayDecimals != null
      ? `${formatAmount(amount, displayDecimals)} ${displaySymbol}`
      : `${amount} ${t('home:enterpriseVaultSignTx.base_units')}`;

  // Every reason the Sign control must stay disabled (fail closed). null =
  // signable. handleSign re-checks the same predicate.
  const signBlockReason: string | null = (() => {
    if (indexError) return indexError;
    // VD: an unverifiable / changed vault or a request that does not derive
    // from it is never signable.
    if (vaultGateError) return vaultGateError.message;
    if (vaultCheckError) return vaultCheckError;
    if (isMessageSign) {
      // Vault message signing is EVM-only (personal_sign digest).
      return isEvmChain
        ? null
        : t('home:enterpriseVaultSignTx.err_message_sign_chain');
    }
    if (solDecodePending) return null; // rendered as pending, still disabled
    if (solSignBlocked) {
      return (
        solDecodeState?.decoded.error ??
        t('home:enterpriseVaultSignTx.sol_decode_mismatch_blocked')
      );
    }
    if (isEvmChain && !decodedTx) {
      return t('home:enterpriseVaultSignTx.err_sign_unverifiable');
    }
    if (decodedTx?.error) return decodedTx.error;
    if (decodedTx && decodedTx.recipients.length === 0) {
      return t('home:enterpriseVaultSignTx.err_no_decoded_recipients');
    }
    if (prevoutCheck.status === 'error') return prevoutCheck.error;
    return null;
  })();
  const signPending =
    vaultPending ||
    solDecodePending ||
    (needsPrevoutCheck && prevoutCheck.status === 'pending');
  const signDisabled = !!signBlockReason || signPending;

  // Parse the server-computed advisory simulation, if present. Defensive: a
  // malformed/absent simulation must NEVER break the sign screen
  // (never-strand-funds invariant). Returns null on any structural problem.
  const simulation = useMemo<ProposalSimulation | null>(() => {
    if (!simulationJson) return null;
    try {
      return parseProposalSimulation(JSON.parse(simulationJson));
    } catch {
      return null;
    }
  }, [simulationJson]);

  // SIMULATION_DECODE_MISMATCH: compare the server simulation to THIS device's
  // own trustless decode. On divergence, prepend a synthetic critical warning
  // and visually downrank the server preview. This NEVER blocks signing — the
  // device decode below remains authoritative.
  const decodeMismatch = useMemo(
    () => detectDecodeMismatch(simulation, decodedTx),
    [simulation, decodedTx],
  );

  const localWarnings = useMemo<SimWarning[]>(() => {
    if (decodeMismatch.mismatch) {
      return [buildDecodeMismatchWarning(decodeMismatch)];
    }
    return [];
  }, [decodeMismatch]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  // Handle enterpriseVaultSigned response from Key
  useEffect(() => {
    if (enterpriseVaultSigned && waitingForKey && requestId) {
      if (enterpriseVaultSigned.requestId === requestId) {
        console.log(
          '[EnterpriseVaultSignTx] Received response from Key, requestId:',
          enterpriseVaultSigned.requestId,
        );
        setWaitingForKey(false);
        setLoading(false);

        // Build complete response
        // For EVM: Key returns signerContribution + challenge (raw sums, no ABI encoding)
        // For UTXO: Key returns signedHex (TX with both wallet+key SIGHASH sigs)
        // For Solana: Key returns keySignatureBase64 — single ed25519 sig.
        const isSolanaSig = !!enterpriseVaultSigned.keySignatureBase64;
        const keySignatures: string[] = isSolanaSig
          ? [enterpriseVaultSigned.keySignatureBase64!]
          : enterpriseVaultSigned.signerContribution
            ? [enterpriseVaultSigned.signerContribution]
            : (enterpriseVaultSigned.keySignatures ?? []);
        // Challenge source priority:
        // 1. Key's challenge (dual mode + key-only mode: Key signed)
        // 2. Wallet's stored challenge (wallet-only mode: Key didn't sign, returned empty)
        // 3. Fallback to keySignatures (UTXO / legacy)
        // Solana doesn't use challenges — pass keySignatures through unchanged.
        const challengeValue =
          enterpriseVaultSigned.challenge || walletChallengeRef.current;
        const keySignaturesChallenges: string[] = isSolanaSig
          ? keySignatures
          : challengeValue
            ? [challengeValue]
            : keySignatures;

        const response: EnterpriseVaultSignTxResponse = {
          walletSignatures: enterpriseVaultSigned.signerContribution
            ? [enterpriseVaultSigned.signerContribution]
            : walletSignatures!,
          keySignatures: keySignaturesChallenges,
          walletPubKey: walletPubKey!,
          keyPubKey: enterpriseVaultSigned.keyPubKey,
          wkIdentity,
          chain,
          orgIndex,
          vaultIndex,
          // UTXO progressive signing: forward signedHex to enterprise app
          ...(enterpriseVaultSigned.signedHex
            ? { signedHex: enterpriseVaultSigned.signedHex }
            : {}),
        };

        if (openAction) {
          openAction({
            status: 'SUCCESS',
            result: response,
          });
        }

        // Cleanup
        clearEnterpriseVaultSigned?.();
        resetState();
      }
    }
  }, [enterpriseVaultSigned, waitingForKey, requestId]);

  // Handle enterpriseVaultSignRejected from Key
  useEffect(() => {
    if (enterpriseVaultSignRejected && waitingForKey) {
      clearEnterpriseVaultSignRejected?.();
      // A rejection that names another request (a stale one) is not ours.
      // One that names none (older SSP Key: '{}') applies to this request.
      const rejectedId = keyRejectionRequestId(enterpriseVaultSignRejected);
      if (rejectedId && requestId && rejectedId !== requestId) {
        console.log('[EnterpriseVaultSignTx] Ignoring a stale Key rejection');
        return;
      }
      console.log('[EnterpriseVaultSignTx] Signing rejected by Key');
      // VD: SSP Key's own descriptor refusal codes pass through to the app.
      const keyVaultCode = vaultErrorCodeFromKey(enterpriseVaultSignRejected);
      if (openAction) {
        openAction({
          status: 'ERROR',
          data: keyVaultCode
            ? `${t('home:enterpriseVaultSignTx.key_rejected')} (${keyVaultCode})`
            : t('home:enterpriseVaultSignTx.key_rejected'),
          errorCode: keyVaultCode ?? 'KEY_REJECTED',
        });
        resetState();
      } else {
        setWaitingForKey(false);
        setLoading(false);
        setError(t('home:enterpriseVaultSignTx.key_rejected'));
      }
    }
  }, [enterpriseVaultSignRejected, waitingForKey, requestId]);

  const resetState = () => {
    setLoading(false);
    setError(null);
    setWalletSignatures(null);
    setWalletPubKey(null);
    setRequestId(null);
    setWaitingForKey(false);
    signingRef.current = false;
    walletChallengeRef.current = '';
  };

  /**
   * Derive the vault master xpriv and keypair at a given addressIndex.
   * Path: m/48'/coin'/orgIndex'/scriptType'/{vaultIndex}/{addressIndex}
   * Returns both the vault xpriv (for per-input UTXO derivation) and
   * the keypair at the specified addressIndex.
   */
  const deriveVaultKeypair = useCallback(
    async (addressIndex: number = 0) => {
      if (!passwordBlob) {
        throw new Error('Not logged in');
      }

      if (!chainConfig) {
        throw new Error('Invalid chain');
      }

      // Get the wallet seed from secure storage
      const walSeedBlob = secureLocalStorage.getItem('walletSeed');
      if (!walSeedBlob || typeof walSeedBlob !== 'string') {
        throw new Error('Could not retrieve wallet seed');
      }

      const fingerprint = getFingerprint();
      let password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Failed to decrypt password');
      }

      let walletSeed = await passworderDecrypt(password, walSeedBlob);
      password = '';
      if (typeof walletSeed !== 'string') {
        throw new Error('Failed to decrypt wallet seed');
      }

      // Derive xpriv at m/48'/coin'/orgIndex'/scriptType'
      const vaultXpriv = getMasterXpriv(
        walletSeed,
        48,
        chainConfig.slip,
        orgIndex,
        chainConfig.scriptType,
        chain as keyof cryptos,
      );

      // Clear sensitive data
      walletSeed = '';

      // Derive keypair at vaultIndex/addressIndex. For Solana, this matches
      // generateSolanaPubkeyArray which now also derives at the same
      // typeIndex=vault.vaultIndex slot — each vault in an org has its own
      // pubkey pool, identical model to EVM/UTXO per-vault key separation.
      const keypair = generateAddressKeypair(
        vaultXpriv,
        vaultIndex,
        addressIndex,
        chain as keyof cryptos,
      );

      return { keypair, vaultXpriv };
    },
    [passwordBlob, chain, orgIndex, vaultIndex, chainConfig],
  );

  /**
   * Sign each input with the wallet's vault private key using SIGHASH (UTXO only).
   * Uses utxolib TransactionBuilder to produce proper ECDSA witness signatures
   * that can be broadcast. Each input is signed with its per-address derived keypair.
   * EVM chains use Schnorr signing via signVaultMessageWithSchnorr() instead.
   */
  const signVaultUtxoInputs = useCallback(
    (vaultXpriv: string): string => {
      const inputCount = parsedInputDetails.length;
      if (inputCount === 0) {
        throw new Error('No inputs to sign');
      }

      const libID = getLibId(chain as keyof cryptos);
      const network = utxolib.networks[libID];
      const chainConfig = blockchains[chain as keyof cryptos];

      // Determine hashType (BCH uses SIGHASH_BITCOINCASHBIP143)
      let hashType = utxolib.Transaction.SIGHASH_ALL;
      if (chainConfig?.hashType) {
        hashType =
          utxolib.Transaction.SIGHASH_ALL |
          utxolib.Transaction.SIGHASH_BITCOINCASHBIP143;
      }

      // Parse TX into TransactionBuilder (unsigned for first signer, partially-signed for subsequent)
      const txb = utxolib.TransactionBuilder.fromTransaction(
        utxolib.Transaction.fromHex(rawUnsignedTx, network),
        network,
      );

      // Sign each input with the correct per-address keypair
      for (let i = 0; i < inputCount; i++) {
        const input = parsedInputDetails[i] as {
          addressIndex?: number;
          witnessScript?: string;
          redeemScript?: string;
          amount?: string;
        };
        // Non-number / out-of-range indices are refused, never coerced to 0.
        const addressIndex = inputAddressIndex(input);

        // Derive keypair for this input's address
        const inputKeypair = generateAddressKeypair(
          vaultXpriv,
          vaultIndex,
          addressIndex,
          chain as keyof cryptos,
        );

        const keyPair = utxolib.ECPair.fromWIF(inputKeypair.privKey, network);

        const witnessScriptBuf = input.witnessScript
          ? Buffer.from(input.witnessScript, 'hex')
          : undefined;
        const redeemScriptBuf = input.redeemScript
          ? Buffer.from(input.redeemScript, 'hex')
          : undefined;
        const amount = input.amount ? Number(input.amount) : 0;

        txb.sign(
          i,
          keyPair,
          redeemScriptBuf,
          hashType,
          amount,
          witnessScriptBuf,
        );
      }

      // buildIncomplete() — other signers (Key, then subsequent WK pairs) will add more sigs
      return txb.buildIncomplete().toHex();
    },
    [parsedInputDetails, rawUnsignedTx, chain, vaultIndex],
  );

  /**
   * Post vault signing request to relay for Key to co-sign.
   */
  const postVaultSignRequest = async (
    walletSigs: string[],
    walletPk: string,
    reqId: string,
    schnorrData: {
      sigOne: string;
      challenge: string;
    } | null,
    signerKeys: string[] | undefined,
    signerNonces: Array<{ kPublic: string; kTwoPublic: string }> | undefined,
    verifiedSigningMode: string,
  ) => {
    // Use props if available, fall back to locally-built arrays (M=1 fallback)
    const effectiveKeys = allSignerKeys?.length ? allSignerKeys : signerKeys;
    const effectiveNonces = allSignerNonces?.length
      ? allSignerNonces
      : signerNonces;
    // Field names and types are pinned by the cross-repo contract test
    // (tests/lib/vaultRelayPayload.spec.ts <-> SSP Key's parser).
    const payload = buildVaultSignRelayPayload({
      chain,
      chainType: chainConfig?.chainType,
      orgIndex,
      vaultIndex,
      vaultName,
      orgName,
      recipients: parsedRecipients,
      fee,
      memo,
      rawUnsignedTx,
      inputDetails: parsedInputDetails,
      walletSignatures: walletSigs,
      walletPubKey: walletPk,
      requestId: reqId,
      wkIdentity,
      scriptType: getScriptType(chainConfig?.scriptType ?? 'p2sh'),
      proposalRefs,
      // The VERIFIED descriptor's mode, never the request's optional field.
      signingMode: verifiedSigningMode,
      reservedKeyNonce,
      schnorrData,
      tokenContract,
      tokenSymbol,
      tokenDecimals,
      sourceAddress,
      evmUserOp,
      vaultDescriptor,
      vaultDescriptorHash,
      signMessage,
      dappOrigin,
      simulation: simulationJson,
      allSignerKeys: effectiveKeys,
      allSignerNonces: effectiveNonces,
    });

    const data: Record<string, unknown> = {
      action: 'enterprisevaultsign',
      payload: JSON.stringify(payload),
      chain,
      path: '10-0', // identity path for auth
      wkIdentity,
    };

    // RA-2: /v1/action requires WK auth — never post the partial signature
    // unauthenticated (throws instead).
    const signedData = await attachRequiredWkAuth(
      data,
      wkIdentity,
      createWkIdentityAuth,
    );

    await axios.post(`https://${sspConfig().relay}/v1/action`, signedData);
  };

  /**
   * Handle sign button click.
   */
  const handleSign = async () => {
    // Fail closed: never sign while any decode/verification is pending or
    // has failed (Solana mismatch/undecodable/unverified approve, EVM decode
    // error or unsafe call, invalid indices, unverified DOGE/RVN amounts).
    if (signDisabled) return;
    if (signingRef.current) return;
    signingRef.current = true;
    setLoading(true);
    setError(null);

    // Declare sensitive vars outside try so they can be cleared in catch/finally
    let vaultXpriv = '';
    let keypair: { pubKey: string; privKey: string } = {
      pubKey: '',
      privKey: '',
    };

    try {
      // Guard: wallet must be synced with Key (wkIdentity must be set)
      if (!wkIdentity) {
        throw new Error(t('home:enterpriseVaultXpub.err_not_synced'));
      }
      // RA-2: the partial signature can only be delivered with relay auth —
      // refuse BEFORE any nonce is burned or anything is signed.
      if (!isAuthAvailable) {
        throw new Error(t('home:enterpriseVaultSignTx.err_auth_unavailable'));
      }
      // Message signing carries no recipients (it signs a message digest, not a
      // transfer) — only transactions require (decoded) recipients.
      if (
        !isMessageSign &&
        (!decodedTx || decodedTx.error || decodedTx.recipients.length === 0)
      ) {
        throw new Error(
          decodedTx?.error ??
            t('home:enterpriseVaultSignTx.err_sign_unverifiable'),
        );
      }
      if (parsedInputDetails.length === 0) {
        throw new Error('No input details found');
      }

      // addressIndex comes from inputDetails[0] for all chains. For UTXO this
      // is the source address; for EVM it's the sender address index; for
      // Solana the enterprise app synthesizes a single entry carrying the
      // proposal's solanaBundle.addressIndex so the wallet derives the right
      // ed25519 keypair to match the on-chain multisig PDA.
      const txAddressIndex = inputAddressIndex(parsedInputDetails[0]);
      // H-1: re-check every derivation index at sign time.
      assertEnterpriseIndices({
        orgIndex,
        vaultIndex,
        addressIndexes: parsedInputDetails.map((input) =>
          inputAddressIndex(input),
        ),
      });

      // Derive vault signing keypair at the correct addressIndex
      const derived = await deriveVaultKeypair(txAddressIndex);
      keypair = derived.keypair;
      vaultXpriv = derived.vaultXpriv;

      // VD-3 / VD-4 again at sign time, BEFORE any nonce is burned or anything
      // is signed: the vault must still verify and match its pin — with this
      // device's own xpub taken from the very key it is about to sign with —
      // and the request must still derive from it.
      const signTimeVault = vaultGate.reverify(
        ownVaultAccountXpubFromXpriv(vaultXpriv, chain, vaultIndex),
      );
      checkVaultSignRequest(signTimeVault.descriptor, vaultSignCheckInput);
      // Every mode branch below follows the VERIFIED descriptor's signing
      // mode — never the request's optional `signingMode` field, which a
      // request may simply leave out.
      const vaultMode = signTimeVault.descriptor.signingMode ?? '';
      // A first-sight vault is pinned only here: after every check of this
      // request passed, immediately before the key is used (nonce burn,
      // signature, or forwarding to SSP Key).
      const commitVaultPin = () => {
        vaultGate.commitPin(signTimeVault);
      };
      // Relay request id — generated before an EVM partial is made so it is
      // persisted with it (a retry re-posts the same partial under it).
      let reqId = generateRequestId();

      const isEvm =
        chainConfig?.chainType === 'evm' &&
        !!reservedNonce &&
        !!reservedKeyNonce;

      let signatures: string[];
      let schnorrData: {
        sigOne: string;
        challenge: string;
      } | null = null;
      // Locally-built signing arrays (used for M=1 fallback when props don't have them)
      let effectiveSignerKeys: string[] | undefined;
      let effectiveSignerNonces:
        | Array<{ kPublic: string; kTwoPublic: string }>
        | undefined;

      if (isEvm) {
        // EVM: Schnorr signing with enterprise nonces.
        // TRUSTLESS BINDING (parity with the Solana vault path): the approval
        // UI decodes/displays evmUserOp (tx) or signMessage (personal_sign),
        // but the Schnorr sign consumes rawUnsignedTx — an opaque hash. A
        // compromised relay could show a benign operation while the wallet
        // co-signs a vault-draining one. Recompute the hash on-device from
        // what was DISPLAYED and refuse on mismatch (same primitives the
        // honest wallet builds with, so a legitimate proposal always matches).
        if (isMessageSign) {
          if (!messageDigestMatches(signMessage, rawUnsignedTx)) {
            throw new Error(t('home:enterpriseVaultSignTx.err_sign_mismatch'));
          }
        } else if (normalizedUserOp?.ok) {
          // H-15: hash EXACTLY the object that was decoded and displayed.
          if (
            !userOpHashMatches(
              normalizedUserOp.op,
              chain as keyof cryptos,
              rawUnsignedTx,
            )
          ) {
            throw new Error(t('home:enterpriseVaultSignTx.err_sign_mismatch'));
          }
        } else {
          throw new Error(
            t('home:enterpriseVaultSignTx.err_sign_unverifiable'),
          );
        }

        // Key-only vault (per the verified descriptor): the wallet holds no
        // key of this vault and skips Schnorr signing; SSP Key signs.
        const isKeyOnlyMode = vaultMode === 'key_only';
        if (!isKeyOnlyMode && !reservedNonce.kPublic) {
          throw new Error(
            'Enterprise nonces required for EVM vault signing. Please wait for nonce replenishment.',
          );
        }

        if (isKeyOnlyMode) {
          // Key-only vault: wallet doesn't participate in Schnorr signing.
          // Forward allSignerKeys/allSignerNonces directly to Key — only keys
          // derived from the pinned vault (VD-4, parity with SSP Key).
          console.log(
            '[EnterpriseVaultSignTx] Key-only mode — skipping wallet Schnorr signing',
          );
          if (allSignerKeys !== undefined && allSignerKeys !== null) {
            checkEvmSignerKeysAgainstDescriptor(
              signTimeVault.descriptor,
              txAddressIndex,
              allSignerKeys,
              null,
            );
          }
          commitVaultPin();
          effectiveSignerKeys = allSignerKeys;
          effectiveSignerNonces = allSignerNonces;
          signatures = [''];
          schnorrData = { sigOne: '', challenge: '' };
        } else {
          // Dual mode: wallet participates in Schnorr signing
          if (!passwordBlob)
            throw new Error(
              t('home:enterpriseVaultSignTx.err_password_unavailable'),
            );

          // 1. Build allKeys and allNonces arrays for M-of-N signing
          let signingKeys: string[];
          let signingNonces: Array<{ kPublic: string; kTwoPublic: string }>;

          if (allSignerKeys?.length && allSignerNonces?.length) {
            // M-of-N: use pre-built arrays from enterprise app
            signingKeys = allSignerKeys;
            signingNonces = allSignerNonces;
          } else {
            // M=1 fallback: build 2-element arrays from this signer's data
            if (!keyXpub)
              throw new Error(
                'Key vault xpub not provided. Re-run vault setup.',
              );
            const keyVaultPubKey = deriveEVMPublicKey(
              keyXpub,
              vaultIndex,
              txAddressIndex,
              chain as keyof cryptos,
            );
            signingKeys = [keypair.pubKey, keyVaultPubKey];
            signingNonces = [
              {
                kPublic: reservedNonce.kPublic,
                kTwoPublic: reservedNonce.kTwoPublic,
              },
              {
                kPublic: reservedKeyNonce.kPublic,
                kTwoPublic: reservedKeyNonce.kTwoPublic,
              },
            ];
          }

          // VD-4 (parity with SSP Key): every signer key — the enterprise
          // app's list, or the M=1 pair built from the request's key xpub —
          // is a key of the pinned vault at this address, and this wallet's
          // own key is one of them. Checked BEFORE the nonce is burned.
          checkEvmSignerKeysAgainstDescriptor(
            signTimeVault.descriptor,
            txAddressIndex,
            signingKeys,
            keypair.pubKey,
          );

          // Track effective arrays so we can forward them to Key
          effectiveSignerKeys = signingKeys;
          effectiveSignerNonces = signingNonces;

          commitVaultPin();

          // 2. Check-and-burn + Schnorr partial sign (H-19 / K2). Under a
          //    cross-view Web Lock the pool is read straight from storage,
          //    the burned set is consulted, and the nonce is DURABLY burned
          //    before the partial signature is computed — so it can never be
          //    used twice, from this view or any other. The signature is
          //    posted only after this resolves. The partial is stored with
          //    the message and signer set it was made for, so a retry after
          //    a failed post re-posts that SAME partial (never a new one).
          const signingKeypair = keypair;
          const partialBinding = {
            message: rawUnsignedTx,
            signingKeys,
            signingNonces,
          };
          const firstRequestId = reqId;
          const consume = () =>
            consumeEnterpriseNonceForPartial(
              reservedNonce,
              passwordBlob,
              partialBinding,
              firstRequestId,
              (walletNonce) =>
                signVaultMessageWithSchnorr(
                  rawUnsignedTx,
                  signingKeypair,
                  walletNonce,
                  signingKeys,
                  signingNonces,
                ),
            );
          let result: {
            sigOne: string;
            challenge: string;
            requestId: string;
            replayed: boolean;
          };
          try {
            result = await consume();
          } catch (nonceError) {
            if (
              nonceError instanceof EnterpriseNonceError &&
              nonceError.code === 'not_found'
            ) {
              // A replenish in another view may still be writing the pool —
              // retry once after a short delay.
              console.log(
                '[EnterpriseVaultSignTx] Reserved nonce not found, retrying in 2s…',
              );
              await new Promise((r) => setTimeout(r, 2000));
              try {
                result = await consume();
              } catch (retryError) {
                if (
                  retryError instanceof EnterpriseNonceError &&
                  retryError.code === 'not_found'
                ) {
                  throw new Error(
                    t('home:enterpriseVaultSignTx.err_nonce_not_found'),
                  );
                }
                throw retryError;
              }
            } else if (
              nonceError instanceof EnterpriseNonceError &&
              nonceError.code === 'already_used'
            ) {
              throw new Error(
                t('home:enterpriseVaultSignTx.err_nonce_already_used'),
              );
            } else {
              throw nonceError;
            }
          }
          if (result.replayed) {
            console.log(
              '[EnterpriseVaultSignTx] Re-posting the partial signature already made with this nonce',
            );
          }
          reqId = result.requestId;
          signatures = [result.sigOne];
          schnorrData = {
            sigOne: result.sigOne,
            challenge: result.challenge,
          };
          // Store wallet's challenge for wallet-only mode fallback
          walletChallengeRef.current = result.challenge;
        }
      } else if (chainConfig?.chainType === 'evm') {
        // EVM chain but missing nonces — cannot sign without enterprise nonces
        throw new Error(
          'Enterprise nonces required for EVM vault signing. Please wait for nonce replenishment.',
        );
      } else if (chainConfig?.chainType === 'sol') {
        // Solana enterprise: ed25519 partial-sign the bundled tx.
        // rawUnsignedTx carries the bundle from solanaVaultProposalBuilderService
        // (base64 of nonceAdvance + create + approve×threshold + execute + close).
        const { Transaction: SolTransaction, Keypair: SolKeypair } =
          await import('@solana/web3.js');
        commitVaultPin();
        const walletSecretKey = new Uint8Array(
          Buffer.from(keypair.privKey, 'hex'),
        );
        const walletKeypair = SolKeypair.fromSecretKey(walletSecretKey);
        let walletSigBase64: string;
        try {
          const tx = SolTransaction.from(Buffer.from(rawUnsignedTx, 'base64'));
          tx.partialSign(walletKeypair);
          const sigEntry = tx.signatures.find((s) =>
            s.publicKey.equals(walletKeypair.publicKey),
          );
          if (!sigEntry?.signature) {
            throw new Error(
              'Solana partial-sign produced no signature at wallet slot',
            );
          }
          walletSigBase64 = Buffer.from(sigEntry.signature).toString('base64');
        } finally {
          // Zero the raw 64-byte ed25519 secret-key buffer regardless of
          // success/failure. SolKeypair holds an internal reference too —
          // we can't reach into it, but zeroing the source buffer makes
          // recovery from memory considerably harder. JS GC doesn't promise
          // prompt zeroing, so this is a defense-in-depth wipe to match the
          // hex-string clear at line ~861 (vaultXpriv / keypair.privKey).
          walletSecretKey.fill(0);
        }
        signatures = [walletSigBase64];
        // sol_single skips Key entirely; sol_dual forwards to Key for ed25519 co-sign.
      } else if (vaultMode === 'key_only') {
        // UTXO key-only: wallet doesn't sign, forward raw TX for Key to sign independently
        console.log(
          '[EnterpriseVaultSignTx] Key-only UTXO mode — skipping wallet signing',
        );
        commitVaultPin();
        signatures = [rawUnsignedTx];
      } else {
        // UTXO: SIGHASH-based signing via TransactionBuilder (proper ECDSA witness sigs)
        commitVaultPin();
        const walletSignedHex = signVaultUtxoInputs(vaultXpriv);
        // Pack wallet-signed hex into signatures array — postVaultSignRequest extracts it
        // as walletSignedHex for Key to load and add its signatures on top
        signatures = [walletSignedHex];
      }

      // Clear sensitive key material
      vaultXpriv = '';
      keypair = { pubKey: keypair.pubKey, privKey: '' };

      setWalletSignatures(signatures);
      setWalletPubKey(keypair.pubKey);

      // sol_single skips Key: wallet ed25519 is the only sig needed per signer.
      // Return immediately without round-tripping to the Key device.
      if (vaultMode === 'sol_single') {
        setLoading(false);
        if (openAction) {
          openAction({
            status: 'SUCCESS',
            result: {
              walletSignatures: signatures,
              keySignatures: [],
              walletPubKey: keypair.pubKey,
              keyPubKey: '',
              wkIdentity: wkIdentity ?? '',
              chain,
              orgIndex,
              vaultIndex,
            },
          });
        }
        signingRef.current = false;
        return;
      }

      // Send to Key for co-signing
      setRequestId(reqId);
      setWaitingForKey(true);

      await postVaultSignRequest(
        signatures,
        keypair.pubKey,
        reqId,
        schnorrData,
        effectiveSignerKeys,
        effectiveSignerNonces,
        vaultMode,
      );
      // Now wait for enterpriseVaultSigned event from socket
    } catch (err) {
      // Clear sensitive key material on error path
      vaultXpriv = '';
      keypair = { pubKey: keypair?.pubKey ?? '', privKey: '' };
      console.error('[EnterpriseVaultSignTx] Error:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';

      // Classify error for structured error code
      const isNonceError =
        errMsg.includes('nonce not found locally') ||
        errMsg.includes('No enterprise nonces available') ||
        errMsg.includes('Enterprise nonces required');
      const errorCode =
        err instanceof VaultDescriptorError
          ? vaultGateErrorCode(err.code)
          : isNonceError
            ? 'NONCE_NOT_FOUND'
            : 'SIGNING_ERROR';

      // Send structured error back to enterprise app and close modal
      if (openAction) {
        openAction({
          status: 'ERROR',
          data: errMsg,
          errorCode,
        });
        resetState();
      } else {
        setLoading(false);
        setError(errMsg);
        signingRef.current = false;
      }
    }
  };

  /**
   * Handle cancel/reject.
   */
  const handleCancel = () => {
    // A confirmation that never led to a signature is forgotten.
    vaultGate.discardStagedPin();
    if (openAction) {
      // A refused vault answers with its reason so SSP Enterprise can show it.
      openAction(
        vaultGateError
          ? {
              status: 'ERROR',
              data: vaultGateError.message,
              errorCode: vaultGateErrorCode(vaultGateError.code),
            }
          : null,
      );
    }
    resetState();
  };

  /** The user did not confirm the vault on first sight: refuse. */
  const handlePinDeclined = () => {
    vaultGate.discardStagedPin();
    if (openAction) {
      openAction({
        status: 'ERROR',
        data: t('home:vaultDescriptor.pin_declined'),
        errorCode: VAULT_ERROR_CODES.pinRefused,
      });
    }
    resetState();
  };

  return (
    <>
      <VaultPinConfirm
        open={open && vaultGate.state.status === 'needs_pin'}
        verified={
          vaultGate.state.status === 'needs_pin'
            ? vaultGate.state.verified
            : null
        }
        vaultName={vaultName}
        orgName={orgName}
        onApprove={vaultGate.confirmPin}
        onCancel={handlePinDeclined}
      />
      <Modal
        title={t('home:enterpriseVaultSignTx.title')}
        open={open}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
        maskClosable={false}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16, width: '100%' }}
        >
          <Text>{t('home:enterpriseVaultSignTx.description')}</Text>

          {/* Requester Info */}
          {requesterInfo && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              {requesterInfo.iconUrl && (
                <img
                  src={requesterInfo.iconUrl}
                  alt=""
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    objectFit: 'contain',
                    marginBottom: 8,
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              {requesterInfo.siteName && (
                <Text strong style={{ fontSize: '15px', display: 'block' }}>
                  {requesterInfo.siteName}
                </Text>
              )}
              <Text
                type="secondary"
                style={{ fontSize: '12px', fontFamily: 'var(--ssp-mono)' }}
              >
                {requesterInfo.origin}
              </Text>
            </div>
          )}

          {/* Vault Info */}
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div className="vault-sign-info-box">
              <Space
                direction="vertical"
                size="small"
                style={{ width: '100%' }}
              >
                {vaultName && (
                  <div>
                    <Text type="secondary">
                      {t('home:enterpriseVaultSignTx.vault_name')}:{' '}
                    </Text>
                    <Text strong>{vaultName}</Text>
                  </div>
                )}
                {orgName && (
                  <div>
                    <Text type="secondary">
                      {t('home:enterpriseVaultSignTx.org_name')}:{' '}
                    </Text>
                    <Text strong>{orgName}</Text>
                  </div>
                )}
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseVaultSignTx.chain')}:{' '}
                  </Text>
                  <Text strong>
                    {chainConfig
                      ? `${chainConfig.name} (${chainConfig.symbol})`
                      : chain}
                  </Text>
                </div>
                {decodedTx?.sender && (
                  <div>
                    <Text type="secondary">
                      {t('home:enterpriseVaultSignTx.source_address')}:{' '}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'var(--ssp-mono)',
                        fontSize: '11px',
                        wordBreak: 'break-all',
                      }}
                    >
                      {decodedTx.sender}
                    </Text>
                  </div>
                )}
              </Space>
            </div>
          </Space>

          {/* VD: vault verified on this device (or why it was refused), with
            the source address derived from the pinned signer set. */}
          <VaultDescriptorStatus
            state={vaultGate.state}
            sourceAddress={
              vaultCheck?.ok ? vaultCheck.result.sourceAddress : null
            }
            checkError={vaultCheckError}
          />

          {/* WalletConnect Phase 2 — message-signing mode: show the message text +
            dApp, NOT a transaction decode (there is no transaction). */}
          {isMessageSign && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              {dappOrigin && (
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseVaultSignTx.sign_dapp')}:{' '}
                  </Text>
                  <Text strong>{dappOrigin}</Text>
                </div>
              )}
              <Space
                direction="vertical"
                size="small"
                style={{ width: '100%' }}
              >
                <Text type="secondary" strong>
                  {t('home:enterpriseVaultSignTx.sign_message')}:
                </Text>
                <div
                  className="vault-sign-recipient-box"
                  style={{
                    textAlign: 'left',
                    maxHeight: 220,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'var(--ssp-mono)',
                    fontSize: '12px',
                  }}
                >
                  {signMessage}
                </div>
              </Space>
            </>
          )}

          {!isMessageSign && (
            <>
              <Divider style={{ margin: '8px 0' }} />

              {/* Decoded transaction data notice */}
              <Text
                type="secondary"
                style={{ fontSize: '12px', textAlign: 'center' }}
              >
                {t('home:enterpriseVaultSignTx.decoded_notice')}
              </Text>

              {/* Decode failure — HARD BLOCK (fail closed). Covers EVM calls that
            are not plain transfers (approve, upgrade, self-call, unknown
            calldata, executeBatch that cannot be decoded), ambiguous user
            operations and undecodable UTXO data. */}
              {decodedTx?.error && !isSolChain && (
                <Alert
                  type="error"
                  message={t('home:enterpriseVaultSignTx.decode_error')}
                  description={
                    <>
                      <div>{decodedTx.error}</div>
                      {decodedTx.tokenContract && (
                        <div
                          style={{
                            fontFamily: 'var(--ssp-mono)',
                            fontSize: '11px',
                            wordBreak: 'break-all',
                            marginTop: 4,
                          }}
                        >
                          {t('home:enterpriseVaultSignTx.contract_address')}:{' '}
                          {decodedTx.tokenContract}
                        </div>
                      )}
                      {decodedTx.callData && (
                        <div
                          style={{
                            fontFamily: 'var(--ssp-mono)',
                            fontSize: '11px',
                            wordBreak: 'break-all',
                            maxHeight: 72,
                            overflowY: 'auto',
                            marginTop: 4,
                          }}
                        >
                          {decodedTx.callData}
                        </div>
                      )}
                    </>
                  }
                  showIcon
                  style={{ textAlign: 'left' }}
                />
              )}

              {/* Solana byte-vs-payload contradiction — HARD BLOCK. A successful
            decode that disagrees with the relay-supplied display payload is
            an active-attack indicator; the Sign button below is disabled. */}
              {isSolChain && solDecodeState?.mismatch && (
                <Alert
                  type="error"
                  message={t(
                    'home:enterpriseVaultSignTx.sol_decode_mismatch_blocked',
                  )}
                  description={solDecodeState.mismatchReasons.join('; ')}
                  showIcon
                  style={{ textAlign: 'left' }}
                />
              )}

              {/* Solana bytes or on-chain proposal this device could not verify —
            HARD BLOCK (H-13). */}
              {isSolChain &&
                solDecodeState &&
                !solDecodeState.mismatch &&
                !!solDecodeState.decoded.error && (
                  <Alert
                    type="error"
                    message={t(
                      'home:enterpriseVaultSignTx.sol_undecodable_warning',
                    )}
                    description={solDecodeState.decoded.error}
                    showIcon
                    style={{ textAlign: 'left' }}
                  />
                )}

              {/* Solana split-flow approval verified against the on-chain
            proposal at the approve target. */}
              {isSolChain &&
                solDecodeState?.kind === 'approve' &&
                solDecodeState.verifiedOnChain &&
                !solSignBlocked && (
                  <Alert
                    type="info"
                    message={t(
                      'home:enterpriseVaultSignTx.sol_approve_only_notice',
                    )}
                    showIcon
                    style={{ textAlign: 'left' }}
                  />
                )}

              {/* Solana on-chain proposal fetch in progress. */}
              {solDecodePending && (
                <Alert
                  type="info"
                  message={t('home:enterpriseVaultSignTx.verifying')}
                  icon={<Spin size="small" />}
                  showIcon
                  style={{ textAlign: 'left' }}
                />
              )}

              {/* DOGE/RVN input amounts (UTXO-5). */}
              {needsPrevoutCheck && prevoutCheck.status === 'pending' && (
                <Alert
                  type="info"
                  message={t('home:enterpriseVaultSignTx.verifying_inputs')}
                  icon={<Spin size="small" />}
                  showIcon
                  style={{ textAlign: 'left' }}
                />
              )}
              {prevoutCheck.status === 'error' && (
                <Alert
                  type="error"
                  message={t('home:enterpriseVaultSignTx.inputs_unverified')}
                  description={prevoutCheck.error}
                  showIcon
                  style={{ textAlign: 'left' }}
                />
              )}

              {/* Unknown token: raw base units + contract, never relay metadata. */}
              {tokenUnverified && (
                <Alert
                  type="warning"
                  message={t('home:enterpriseVaultSignTx.unverified_token')}
                  showIcon
                  style={{ textAlign: 'left' }}
                />
              )}
              {isTokenTx && (
                <div style={{ textAlign: 'left' }}>
                  <Text type="secondary">
                    {isSolChain
                      ? t('home:enterpriseVaultSignTx.token_mint')
                      : t('home:enterpriseVaultSignTx.token_contract')}
                    :{' '}
                  </Text>
                  <Text
                    copyable={{ text: decodedTx?.tokenContract }}
                    style={{
                      fontFamily: 'var(--ssp-mono)',
                      fontSize: '11px',
                      wordBreak: 'break-all',
                    }}
                  >
                    {decodedTx?.tokenContract}
                  </Text>
                </div>
              )}

              {/* Recipients — decoded from raw transaction (AUTHORITATIVE).
            This device's own trustless decode is the primary source of truth
            for what is being signed. The advisory risk strip below is secondary. */}
              <Space
                direction="vertical"
                size="small"
                style={{ width: '100%' }}
              >
                <Text type="secondary" strong>
                  {t('home:enterpriseVaultSignTx.recipients')}:
                </Text>
                {displayRecipients.map((recipient, index) => (
                  <div key={index} className="vault-sign-recipient-box">
                    <Text
                      copyable={{ text: recipient.address }}
                      style={{
                        fontFamily: 'var(--ssp-mono)',
                        fontSize: '13px',
                        wordBreak: 'break-all',
                        display: 'block',
                      }}
                    >
                      {recipient.address}
                    </Text>
                    <Text
                      strong
                      style={{
                        fontSize: '17px',
                        marginTop: 6,
                        display: 'block',
                      }}
                    >
                      {renderAmount(recipient.amount)}
                    </Text>
                  </div>
                ))}
              </Space>

              {/* VD-4: outputs that pay this vault's own (derived) addresses. */}
              {changeOutputs.length > 0 && (
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: '100%' }}
                >
                  <Text type="secondary">
                    {t('home:vaultDescriptor.change')}:
                  </Text>
                  {changeOutputs.map((output, index) => (
                    <div
                      key={index}
                      className="vault-sign-info-box"
                      style={{ textAlign: 'left' }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('home:vaultDescriptor.change_index', {
                          index: output.vaultAddressIndex,
                        })}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'var(--ssp-mono)',
                          fontSize: '11px',
                          wordBreak: 'break-all',
                          display: 'block',
                        }}
                      >
                        {output.address}
                      </Text>
                      <Text strong>{renderAmount(output.amount)}</Text>
                    </div>
                  ))}
                </Space>
              )}

              {/* Fee — decoded from raw transaction */}
              <Space direction="vertical" size="small">
                <Text type="secondary">
                  {t('home:enterpriseVaultSignTx.fee')}:{' '}
                </Text>
                <Text strong>
                  {formatAmount(decodedTx?.fee ?? fee, chainDecimals)}{' '}
                  {chainSymbol}
                </Text>
              </Space>

              {/* Memo — from metadata (not in raw transaction) */}
              {memo && (
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: '100%' }}
                >
                  <Text type="secondary">
                    {t('home:enterpriseVaultSignTx.memo')}:{' '}
                  </Text>
                  <Text
                    style={{ fontFamily: 'var(--ssp-mono)', fontSize: '12px' }}
                  >
                    {memo}
                  </Text>
                </Space>
              )}

              {/* Advisory risk strip (server-computed simulation). DISPLAY-ONLY —
            never gates signing. Renders critical/high warnings prominently
            above the sign control; medium/info collapse. localWarnings carries
            the device-side SIMULATION_DECODE_MISMATCH when the server preview
            disagrees with the authoritative device decode above. */}
              {(simulation || localWarnings.length > 0) && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  <VaultRiskStrip
                    simulation={simulation}
                    extraWarnings={localWarnings}
                  />
                </>
              )}
            </>
          )}

          <Divider style={{ margin: '8px 0' }} />

          {/* Invalid derivation indices / message signing on a non-EVM chain —
            refused before anything is derived (H-1, CHN-5). */}
          {(indexError || (isMessageSign && !isEvmChain)) && (
            <Alert
              type="error"
              message={t('home:enterpriseVaultSignTx.request_refused')}
              description={signBlockReason}
              showIcon
              style={{ textAlign: 'left' }}
            />
          )}

          {/* Partial signature notice */}
          <Alert
            type="warning"
            message={t('home:enterpriseVaultSignTx.partial_signature_notice')}
            showIcon
            style={{ textAlign: 'left' }}
          />

          {/* SSP Identity */}
          <Space direction="vertical" size="small">
            <Text type="secondary">
              {t('home:enterpriseVaultSignTx.ssp_identity')}:
            </Text>
            <Text
              strong
              style={{ fontFamily: 'var(--ssp-mono)', fontSize: '12px' }}
            >
              {wkIdentity.substring(0, 12)}...
              {wkIdentity.substring(wkIdentity.length - 12)}
            </Text>
          </Space>

          {/* Error display */}
          {error && (
            <Alert
              type="error"
              message={error}
              showIcon
              style={{ textAlign: 'left' }}
            />
          )}

          {/* Waiting for Key indicator — 2-of-2 handshake motif */}
          {waitingForKey && (
            <>
              <HandshakeAnimation
                state="waiting"
                size={56}
                ariaLabel={t('home:enterpriseVaultSignTx.waiting_for_key')}
              />
              <Alert
                type="info"
                message={t('home:enterpriseVaultSignTx.waiting_for_key')}
                icon={<Spin size="small" />}
                showIcon
                style={{ textAlign: 'left' }}
              />
            </>
          )}

          {/* Action buttons */}
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button
              type="primary"
              size="large"
              onClick={handleSign}
              loading={loading}
              disabled={loading || waitingForKey || signDisabled}
            >
              {waitingForKey
                ? t('home:enterpriseVaultSignTx.awaiting_key')
                : t('home:enterpriseVaultSignTx.sign')}
            </Button>
            <Button
              type="link"
              block
              size="small"
              onClick={handleCancel}
              disabled={loading && !waitingForKey}
            >
              {t('common:cancel')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default EnterpriseVaultSignTx;
