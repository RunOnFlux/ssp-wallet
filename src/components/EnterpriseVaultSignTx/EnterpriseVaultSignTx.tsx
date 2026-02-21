import { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Button, Space, Modal, Spin, Alert, Divider } from 'antd';
import { useAppSelector } from '../../hooks';
import './EnterpriseVaultSignTx.css';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { useSocket } from '../../hooks/useSocket';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import {
  getMasterXpriv,
  generateAddressKeypair,
  getScriptType,
  deriveEVMPublicKey,
} from '../../lib/wallet';
import { signMessage } from '../../lib/relayAuth';
import { signVaultMessageWithSchnorr } from '../../lib/evmSigning';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import axios from 'axios';

import { useTranslation } from 'react-i18next';
import { generateRequestId } from '../../lib/wkSign';
import {
  loadEncryptedNonces,
  saveEncryptedNonces,
} from '../../lib/enterpriseNonces';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import type { cryptos } from '../../types';

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
}

interface EnterpriseVaultSignTxData {
  status: string;
  result?: EnterpriseVaultSignTxResponse;
  data?: string;
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
}: Props) {
  const { t } = useTranslation(['home', 'common']);
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { createWkIdentityAuth } = useRelayAuth();
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
          '[EnterpriseVaultSignTx] Received signatures from Key:',
          enterpriseVaultSigned,
        );
        setWaitingForKey(false);
        setLoading(false);

        // Build complete response
        // For EVM: Key returns signerContribution + challenge (raw sums, no ABI encoding)
        // For UTXO: Key returns keySignatures as before
        const keySignatures: string[] = enterpriseVaultSigned.signerContribution
          ? [enterpriseVaultSigned.signerContribution]
          : enterpriseVaultSigned.keySignatures;
        const keySignaturesChallenges: string[] =
          enterpriseVaultSigned.challenge
            ? [enterpriseVaultSigned.challenge]
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
      console.log('[EnterpriseVaultSignTx] Signing rejected by Key');
      setWaitingForKey(false);
      setLoading(false);
      setError(t('home:enterpriseVaultSignTx.key_rejected'));
      clearEnterpriseVaultSignRejected?.();
    }
  }, [enterpriseVaultSignRejected, waitingForKey]);

  const resetState = () => {
    setLoading(false);
    setError(null);
    setWalletSignatures(null);
    setWalletPubKey(null);
    setRequestId(null);
    setWaitingForKey(false);
  };

  /**
   * Derive the vault master xpriv and keypair at a given addressIndex.
   * Path: m/48'/coin'/orgIndex'/scriptType'/0/{addressIndex}
   *
   * vaultIndex is always 0 (reserved for future expansion).
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
      const password = await passworderDecrypt(fingerprint, passwordBlob);
      if (typeof password !== 'string') {
        throw new Error('Failed to decrypt password');
      }

      let walletSeed = await passworderDecrypt(password, walSeedBlob);
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

      // Derive keypair at vaultIndex=0/addressIndex
      const keypair = generateAddressKeypair(
        vaultXpriv,
        0,
        addressIndex,
        chain as keyof cryptos,
      );

      return { keypair, vaultXpriv };
    },
    [passwordBlob, chain, orgIndex, chainConfig],
  );

  /**
   * Sign each input with the wallet's vault private key (UTXO only).
   * Derives a per-input keypair at vaultIndex=0/input.addressIndex to match
   * the key that was used to generate each UTXO address.
   * EVM chains use Schnorr signing via signVaultMessageWithSchnorr() instead.
   */
  const signInputs = useCallback(
    (vaultXpriv: string): string[] => {
      const inputCount = parsedInputDetails.length;
      if (inputCount === 0) {
        throw new Error('No inputs to sign');
      }

      const signatures: string[] = [];

      for (let i = 0; i < inputCount; i++) {
        const input = parsedInputDetails[i] as { addressIndex?: number };
        const addressIndex =
          typeof input?.addressIndex === 'number' ? input.addressIndex : 0;

        // Derive keypair for this input's address
        const inputKeypair = generateAddressKeypair(
          vaultXpriv,
          0, // vaultIndex: always 0
          addressIndex,
          chain as keyof cryptos,
        );

        // Sign: rawUnsignedTx + ':' + inputIndex
        // This ensures each signature is bound to a specific input
        const messageToSign = `${rawUnsignedTx}:${i}`;
        const signature = signMessage(
          messageToSign,
          inputKeypair.privKey,
          chain as keyof cryptos,
        );
        signatures.push(signature);
      }

      return signatures;
    },
    [parsedInputDetails, rawUnsignedTx, chain],
  );

  /**
   * Post vault signing request to relay for Key to co-sign.
   */
  const postVaultSignRequest = async (
    walletSigs: string[],
    walletPk: string,
    reqId: string,
    schnorrData?: {
      sigOne: string;
      challenge: string;
    } | null,
    signerKeys?: string[],
    signerNonces?: Array<{ kPublic: string; kTwoPublic: string }>,
  ) => {
    const payload: Record<string, unknown> = {
      chain,
      orgIndex,
      vaultIndex,
      vaultName,
      orgName,
      recipients: recipientsJson,
      fee,
      memo,
      rawUnsignedTx,
      inputDetails: inputDetailsJson,
      walletSignatures: walletSigs,
      walletPubKey: walletPk,
      requestId: reqId,
      wkIdentity,
      scriptType: getScriptType(chainConfig?.scriptType ?? 'p2sh'),
    };

    // Include Key's reserved nonce for EVM vault signing (Key uses this for its Schnorr signing)
    if (reservedKeyNonce) {
      payload.reservedNonce = reservedKeyNonce;
    }

    // Include Schnorr partial signature data for EVM vault signing
    // Key needs sigOne to sum with its own partial sig
    if (schnorrData) {
      payload.sigOne = schnorrData.sigOne;
    }

    // Include all signer keys/nonces for EVM signing
    // Key needs these to call signMultiSigMsg with the same arrays
    // Use props if available, fall back to locally-built arrays (M=1 fallback)
    const effectiveKeys = allSignerKeys?.length ? allSignerKeys : signerKeys;
    const effectiveNonces = allSignerNonces?.length
      ? allSignerNonces
      : signerNonces;
    if (effectiveKeys?.length) {
      payload.allSignerKeys = JSON.stringify(effectiveKeys);
    }
    if (effectiveNonces?.length) {
      payload.allSignerNonces = JSON.stringify(effectiveNonces);
    }

    const data: Record<string, unknown> = {
      action: 'enterprisevaultsign',
      payload: JSON.stringify(payload),
      chain,
      path: '10-0', // identity path for auth
      wkIdentity,
    };

    // Add authentication
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch {
      console.warn(
        '[EnterpriseVaultSignTx] Auth not available, sending without signature',
      );
    }

    console.log('[EnterpriseVaultSignTx] Posting vault sign request to relay');
    await axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  /**
   * Handle sign button click.
   */
  const handleSign = async () => {
    setLoading(true);
    setError(null);

    try {
      if (parsedRecipients.length === 0) {
        throw new Error('No recipients found');
      }
      if (parsedInputDetails.length === 0) {
        throw new Error('No input details found');
      }

      // Get addressIndex from first input detail (source address for this transaction)
      const firstInput = parsedInputDetails[0] as
        | { addressIndex?: number }
        | undefined;
      const txAddressIndex =
        typeof firstInput?.addressIndex === 'number'
          ? firstInput.addressIndex
          : 0;

      // Derive vault signing keypair at the correct addressIndex
      let { keypair, vaultXpriv } = await deriveVaultKeypair(txAddressIndex);
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
        // EVM: Schnorr signing with enterprise nonces

        // 1. Load wallet's enterprise nonce WITH private parts (encrypted)
        if (!passwordBlob) throw new Error('Password not available');
        const nonces = await loadEncryptedNonces(passwordBlob);
        if (nonces.length === 0)
          throw new Error('No enterprise nonces available');
        const matchIdx = nonces.findIndex(
          (n) =>
            n.kPublic === reservedNonce.kPublic &&
            n.kTwoPublic === reservedNonce.kTwoPublic,
        );
        if (matchIdx === -1)
          throw new Error('Reserved enterprise nonce not found locally');
        const walletNonce = nonces[matchIdx];

        // 2. Build allKeys and allNonces arrays for M-of-N signing
        let signingKeys: string[];
        let signingNonces: Array<{ kPublic: string; kTwoPublic: string }>;

        if (allSignerKeys?.length && allSignerNonces?.length) {
          // M-of-N: use pre-built arrays from enterprise app
          signingKeys = allSignerKeys;
          signingNonces = allSignerNonces;
        } else {
          // M=1 fallback: build 2-element arrays from this signer's data
          if (!keyXpub)
            throw new Error('Key vault xpub not provided. Re-run vault setup.');
          const keyVaultPubKey = deriveEVMPublicKey(
            keyXpub,
            0,
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

        // Track effective arrays so we can forward them to Key
        effectiveSignerKeys = signingKeys;
        effectiveSignerNonces = signingNonces;

        // 3. Schnorr partial sign with variable-length arrays
        const result = signVaultMessageWithSchnorr(
          rawUnsignedTx,
          keypair,
          walletNonce,
          signingKeys,
          signingNonces,
        );
        signatures = [result.sigOne];
        schnorrData = {
          sigOne: result.sigOne,
          challenge: result.challenge,
        };

        // 4. Delete used nonce from local store (never reuse)
        nonces.splice(matchIdx, 1);
        await saveEncryptedNonces(nonces, passwordBlob);
      } else if (chainConfig?.chainType === 'evm') {
        // EVM chain but missing nonces — cannot sign without enterprise nonces
        throw new Error(
          'Enterprise nonces required for EVM vault signing. Please wait for nonce replenishment.',
        );
      } else {
        // UTXO: Bitcoin message signing per input with per-address keypairs
        signatures = signInputs(vaultXpriv);
      }

      // Clear sensitive key material
      vaultXpriv = '';
      keypair = { pubKey: keypair.pubKey, privKey: '' };

      setWalletSignatures(signatures);
      setWalletPubKey(keypair.pubKey);

      // Send to Key for co-signing
      const reqId = generateRequestId();
      setRequestId(reqId);
      setWaitingForKey(true);

      await postVaultSignRequest(
        signatures,
        keypair.pubKey,
        reqId,
        schnorrData,
        effectiveSignerKeys,
        effectiveSignerNonces,
      );
      // Now wait for enterpriseVaultSigned event from socket
    } catch (err) {
      console.error('[EnterpriseVaultSignTx] Error:', err);
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  /**
   * Handle cancel/reject.
   */
  const handleCancel = () => {
    if (openAction) {
      openAction(null);
    }
    resetState();
  };

  return (
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
              style={{ fontSize: '12px', fontFamily: 'monospace' }}
            >
              {requesterInfo.origin}
            </Text>
          </div>
        )}

        {/* Vault Info */}
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div className="vault-sign-info-box">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
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
            </Space>
          </div>
        </Space>

        <Divider style={{ margin: '8px 0' }} />

        {/* Recipients */}
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary" strong>
            {t('home:enterpriseVaultSignTx.recipients')}:
          </Text>
          {parsedRecipients.map((recipient, index) => (
            <div key={index} className="vault-sign-recipient-box">
              <Text
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  wordBreak: 'break-all',
                  display: 'block',
                }}
              >
                {recipient.address}
              </Text>
              <Text strong>
                {formatAmount(recipient.amount, chainDecimals)} {chainSymbol}
              </Text>
            </div>
          ))}
        </Space>

        {/* Fee */}
        <Space direction="vertical" size="small">
          <Text type="secondary">{t('home:enterpriseVaultSignTx.fee')}: </Text>
          <Text strong>
            {formatAmount(fee, chainDecimals)} {chainSymbol}
          </Text>
        </Space>

        {/* Memo */}
        {memo && (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Text type="secondary">
              {t('home:enterpriseVaultSignTx.memo')}:{' '}
            </Text>
            <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {memo}
            </Text>
          </Space>
        )}

        <Divider style={{ margin: '8px 0' }} />

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
          <Text strong style={{ fontFamily: 'monospace', fontSize: '12px' }}>
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

        {/* Waiting for Key indicator */}
        {waitingForKey && (
          <Alert
            type="info"
            message={t('home:enterpriseVaultSignTx.waiting_for_key')}
            icon={<Spin size="small" />}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Action buttons */}
        <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            onClick={handleSign}
            loading={loading}
            disabled={loading || waitingForKey}
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
  );
}

export default EnterpriseVaultSignTx;
