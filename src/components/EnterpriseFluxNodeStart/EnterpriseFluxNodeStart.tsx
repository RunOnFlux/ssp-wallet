import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Button, Space, Modal, Spin, Alert } from 'antd';
import { fluxnode } from '@runonflux/flux-sdk';
import { useAppSelector } from '../../hooks';
import { cryptos } from '../../types';
import { blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { getMasterXpriv, generateAddressKeypair } from '../../lib/wallet';
import { generateRequestId } from '../../lib/wkSign';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import { assertEnterpriseIndices } from '../../lib/enterpriseIndexGuard';
import { attachRequiredWkAuth } from '../../lib/relayRequestAuth';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import { useSocket } from '../../hooks/useSocket';
import { useVaultDescriptorGate } from '../../hooks/useVaultDescriptorGate';
import {
  VaultDescriptorError,
  type VaultDescriptorV1,
} from '../../lib/vaultDescriptor';
import { checkFluxCollateralAgainstDescriptor } from '../../lib/vaultDescriptorDerive';
import {
  VAULT_ERROR_CODES,
  vaultErrorCodeFromKey,
  vaultGateErrorCode,
} from '../../lib/vaultGate';
import {
  computeOwnVaultAccountXpub,
  ownVaultAccountXpubFromXpriv,
} from '../../lib/vaultOwnXpub';
import { buildFluxNodeStartRelayPayload } from '../../lib/vaultRelayPayload';
import VaultPinConfirm from '../VaultPinConfirm/VaultPinConfirm';
import VaultDescriptorStatus from '../VaultPinConfirm/VaultDescriptorStatus';
import axios from 'axios';
import './EnterpriseFluxNodeStart.css';

const { Text } = Typography;

interface EnterpriseFluxNodeStartResponse {
  status: string;
  result?: { signedTxHex: string };
  data?: string;
  errorCode?: string;
}

interface EnterpriseFluxNodeStartProps {
  open: boolean;
  openAction: (data: EnterpriseFluxNodeStartResponse | null) => void;
  requesterInfo: WkSignRequesterInfo | null;
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  addressIndex: number;
  nodeName: string;
  collateralAmount: string;
  collateralAddress?: string;
  identityPubKey: string;
  collateralTxid: string;
  collateralVout: number;
  redeemScript: string;
  signingDevice: 'wallet' | 'key';
  delegates: string[];
  // VD: the vault's signer set (verified + pinned here, forwarded verbatim
  // to SSP Key) and its hash.
  vaultDescriptor?: unknown;
  vaultDescriptorHash?: string;
}

function EnterpriseFluxNodeStart({
  open,
  openAction,
  requesterInfo,
  chain,
  orgIndex,
  vaultIndex,
  addressIndex,
  nodeName,
  collateralAmount,
  collateralAddress,
  identityPubKey,
  collateralTxid,
  collateralVout,
  redeemScript,
  signingDevice,
  delegates,
  vaultDescriptor,
  vaultDescriptorHash,
}: EnterpriseFluxNodeStartProps) {
  const { t } = useTranslation(['home', 'common']);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingForKey, setWaitingForKey] = useState(false);

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { sspWalletKeyInternalIdentity: wkIdentity } = useAppSelector(
    (state) => state.sspState,
  );

  const { enterpriseFluxNodeStarted, clearEnterpriseFluxNodeStarted } =
    useSocket();
  const { createWkIdentityAuth } = useRelayAuth();
  const requestIdRef = useRef('');

  const chainConfig = chain ? blockchains[chain as keyof cryptos] : null;

  // VD-3: the vault must verify and match its pin; VD-4: the collateral's
  // redeem script / address must be the vault's at (vaultIndex, addressIndex).
  const vaultGate = useVaultDescriptorGate({
    open,
    descriptor: vaultDescriptor,
    descriptorHash: vaultDescriptorHash,
    request: { chain, orgIndex, vaultIndex },
    vaultName: nodeName,
  });
  const verifiedVault =
    vaultGate.state.status === 'verified' ? vaultGate.state.verified : null;
  const collateralCheck = useMemo(():
    | { ok: true; address: string }
    | { ok: false; error: string }
    | null => {
    if (!verifiedVault) return null;
    try {
      return {
        ok: true,
        address: checkFluxCollateralAgainstDescriptor(
          verifiedVault.descriptor,
          addressIndex,
          redeemScript,
          collateralAddress,
        ).address,
      };
    } catch (checkError) {
      return {
        ok: false,
        error:
          checkError instanceof Error
            ? checkError.message
            : 'Vault derivation failed',
      };
    }
  }, [verifiedVault, addressIndex, redeemScript, collateralAddress]);
  const vaultGateError =
    vaultGate.state.status === 'error' ? vaultGate.state : null;
  const vaultReady = !!collateralCheck?.ok;

  /**
   * VD-3 + VD-4 again right before signing or forwarding. A first-sight vault
   * confirmed on the pin screen is pinned only here, once every check passed
   * and immediately before the key is used.
   */
  const recheckVault = (ownAccountXpub: string): VaultDescriptorV1 => {
    const verified = vaultGate.reverify(ownAccountXpub);
    checkFluxCollateralAgainstDescriptor(
      verified.descriptor,
      addressIndex,
      redeemScript,
      collateralAddress,
    );
    vaultGate.commitPin(verified);
    return verified.descriptor;
  };

  // Listen for Key's response
  useEffect(() => {
    if (
      enterpriseFluxNodeStarted &&
      waitingForKey &&
      requestIdRef.current &&
      enterpriseFluxNodeStarted.requestId === requestIdRef.current
    ) {
      setWaitingForKey(false);
      setProcessing(false);
      if (enterpriseFluxNodeStarted.signedTxHex) {
        openAction({
          status: 'SUCCESS',
          result: { signedTxHex: enterpriseFluxNodeStarted.signedTxHex },
        });
      } else {
        const rejectionMessage =
          enterpriseFluxNodeStarted.error ||
          t('home:enterpriseFluxNodeStart.key_rejected');
        openAction({
          status: 'ERROR',
          data: rejectionMessage,
          // VD: SSP Key's own descriptor refusal codes pass through.
          errorCode:
            vaultErrorCodeFromKey(enterpriseFluxNodeStarted) ?? 'KEY_REJECTED',
        });
      }
      clearEnterpriseFluxNodeStarted?.();
    }
  }, [
    enterpriseFluxNodeStarted,
    waitingForKey,
    openAction,
    clearEnterpriseFluxNodeStarted,
    t,
  ]);

  const resetState = useCallback(() => {
    setProcessing(false);
    setError(null);
    setWaitingForKey(false);
    requestIdRef.current = '';
    clearEnterpriseFluxNodeStarted?.();
  }, [clearEnterpriseFluxNodeStarted]);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  /**
   * Derive the vault collateral keypair.
   * Path: m/48'/coin'/orgIndex'/scriptType'/{vaultIndex}/{addressIndex}
   */
  const deriveCollateralKeypair = async () => {
    if (!passwordBlob)
      throw new Error(t('home:enterpriseFluxNodeStart.err_not_logged_in'));
    if (!chainConfig)
      throw new Error(t('home:enterpriseFluxNodeStart.err_invalid_chain'));
    // H-1: never derive consumer (0') / recovery (99') keys for an
    // "enterprise" node start.
    assertEnterpriseIndices({
      orgIndex,
      vaultIndex,
      addressIndexes: [addressIndex],
    });

    const walSeedBlob = secureLocalStorage.getItem('walletSeed');
    if (!walSeedBlob || typeof walSeedBlob !== 'string') {
      throw new Error(t('home:enterpriseFluxNodeStart.err_seed_unavailable'));
    }

    const fingerprint = getFingerprint();
    let password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error(t('home:enterpriseFluxNodeStart.err_decrypt_password'));
    }

    let walletSeed = await passworderDecrypt(password, walSeedBlob);
    password = '';
    if (typeof walletSeed !== 'string') {
      throw new Error(t('home:enterpriseFluxNodeStart.err_decrypt_seed'));
    }

    let vaultXpriv = getMasterXpriv(
      walletSeed,
      48,
      chainConfig.slip,
      orgIndex,
      chainConfig.scriptType,
      chain as keyof cryptos,
    );

    walletSeed = '';

    const keypair = generateAddressKeypair(
      vaultXpriv,
      vaultIndex,
      addressIndex,
      chain as keyof cryptos,
    );
    // VD: this device's own account xpub, from the key it signs with.
    const ownXpub = ownVaultAccountXpubFromXpriv(vaultXpriv, chain, vaultIndex);
    vaultXpriv = '';

    return { keypair, ownXpub };
  };

  const handleCancel = () => {
    if (processing && !waitingForKey) return;
    vaultGate.discardStagedPin();
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
    resetState();
  };

  /** The user did not confirm the vault on first sight: refuse. */
  const handlePinDeclined = () => {
    vaultGate.discardStagedPin();
    openAction({
      status: 'ERROR',
      data: t('home:vaultDescriptor.pin_declined'),
      errorCode: VAULT_ERROR_CODES.pinRefused,
    });
    resetState();
  };

  const handleApprove = async () => {
    // Fail closed: nothing is signed or forwarded for an unverified vault.
    if (!vaultReady) return;
    setProcessing(true);
    setError(null);

    let collateralPrivKey = '';

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();

      let delegateData;
      if (delegates.length > 0) {
        delegateData = { version: 1, type: 1, delegatePublicKeys: delegates };
      }

      if (signingDevice === 'wallet') {
        const { keypair, ownXpub } = await deriveCollateralKeypair();
        collateralPrivKey = keypair.privKey;
        // VD-3 / VD-4 at sign time, with the xpub of the signing key.
        recheckVault(ownXpub);

        const signedTxHex = fluxnode.startFluxNodev6WithPubKey(
          collateralTxid,
          collateralVout,
          collateralPrivKey,
          identityPubKey,
          timestamp,
          true,
          redeemScript,
          delegateData,
        );

        collateralPrivKey = '';

        openAction({
          status: 'SUCCESS',
          result: { signedTxHex },
        });
      } else {
        // H-1: the Key derives from these indices — refuse before forwarding.
        assertEnterpriseIndices({
          orgIndex,
          vaultIndex,
          addressIndexes: [addressIndex],
        });
        // VD-3 / VD-4 again before forwarding to SSP Key.
        recheckVault(
          await computeOwnVaultAccountXpub({
            passwordBlob,
            wkIdentity,
            chain,
            orgIndex,
            vaultIndex,
          }),
        );
        const reqId = generateRequestId();
        requestIdRef.current = reqId;

        // Field names and types are pinned by the cross-repo contract test
        // (tests/lib/vaultRelayPayload.spec.ts <-> SSP Key's parser); the
        // descriptor and hash travel verbatim (VD-2).
        const payload = JSON.stringify(
          buildFluxNodeStartRelayPayload({
            chain,
            orgIndex,
            vaultIndex,
            addressIndex,
            nodeName,
            collateralAmount,
            collateralAddress,
            identityPubKey,
            collateralTxid,
            collateralVout,
            redeemScript,
            delegates,
            requestId: reqId,
            wkIdentity,
            vaultDescriptor,
            vaultDescriptorHash,
          }),
        );

        const data: Record<string, unknown> = {
          action: 'enterprisefluxnodestart',
          payload,
          chain,
          path: '10-0',
          wkIdentity,
        };

        // RA-2: /v1/action requires WK auth — never post unauthenticated.
        const signedData = await attachRequiredWkAuth(
          data,
          wkIdentity,
          createWkIdentityAuth,
        );

        await axios.post(`https://${sspConfig().relay}/v1/action`, signedData, {
          timeout: 30000,
        });

        setWaitingForKey(true);
      }
    } catch (err) {
      collateralPrivKey = '';
      console.error('[EnterpriseFluxNodeStart] Error:', err);
      if (err instanceof VaultDescriptorError) {
        openAction({
          status: 'ERROR',
          data: err.message,
          errorCode: vaultGateErrorCode(err.code),
        });
        resetState();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : t('home:enterpriseFluxNodeStart.err_failed'),
      );
      setProcessing(false);
    }
  };

  // Props keep the values of whichever SSP Connect request last used the
  // shared dialog state, so render nothing until this dialog is the active one.
  if (!open) return null;

  const amountFlux = collateralAmount
    ? (parseInt(collateralAmount, 10) / 1e8).toFixed(2)
    : '?';
  const chainLabel = chainConfig
    ? `${chainConfig.name} (${chainConfig.symbol})`
    : chain;
  const deviceLabel =
    signingDevice === 'wallet'
      ? t('home:enterpriseFluxNodeStart.device_wallet')
      : t('home:enterpriseFluxNodeStart.device_key');
  const utxoFull = collateralTxid ? `${collateralTxid}:${collateralVout}` : '';
  const utxoDisplay = collateralTxid
    ? `${collateralTxid.slice(0, 10)}…${collateralTxid.slice(-8)}:${collateralVout}`
    : '';

  return (
    <>
      <VaultPinConfirm
        open={vaultGate.state.status === 'needs_pin'}
        verified={
          vaultGate.state.status === 'needs_pin'
            ? vaultGate.state.verified
            : null
        }
        vaultName={nodeName}
        onApprove={vaultGate.confirmPin}
        onCancel={handlePinDeclined}
      />
      <Modal
        title={t('home:enterpriseFluxNodeStart.title')}
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
          <Text>{t('home:enterpriseFluxNodeStart.description')}</Text>

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

          {/* Node Info */}
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div className="flux-node-start-info-box">
              <Space
                direction="vertical"
                size="small"
                style={{ width: '100%' }}
              >
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.node')}:{' '}
                  </Text>
                  <Text strong>{nodeName || '-'}</Text>
                </div>
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.chain')}:{' '}
                  </Text>
                  <Text strong>{chainLabel}</Text>
                </div>
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.collateral')}:{' '}
                  </Text>
                  <Text strong>{amountFlux} FLUX</Text>
                </div>
                {collateralAddress && (
                  <div>
                    <Text type="secondary">
                      {t('home:enterpriseFluxNodeStart.collateral_address')}
                      :{' '}
                    </Text>
                    <Text
                      strong
                      copyable={{ text: collateralAddress }}
                      style={{
                        fontFamily: 'var(--ssp-mono)',
                        fontSize: 12,
                        wordBreak: 'break-all',
                      }}
                    >
                      {collateralAddress}
                    </Text>
                  </div>
                )}
                {utxoDisplay && (
                  <div>
                    <Text type="secondary">
                      {t('home:enterpriseFluxNodeStart.collateral_utxo')}:{' '}
                    </Text>
                    <Text
                      strong
                      copyable={{ text: utxoFull }}
                      style={{ fontFamily: 'var(--ssp-mono)', fontSize: 12 }}
                    >
                      {utxoDisplay}
                    </Text>
                  </div>
                )}
                <div>
                  <Text type="secondary">
                    {t('home:enterpriseFluxNodeStart.signing_with')}:{' '}
                  </Text>
                  <Text strong>{deviceLabel}</Text>
                </div>
                {delegates.length > 0 && (
                  <div>
                    <Text type="secondary">
                      {t('home:enterpriseFluxNodeStart.delegates')}:{' '}
                    </Text>
                    <Text strong>{delegates.length}</Text>
                  </div>
                )}
              </Space>
            </div>
          </Space>

          {/* SSP Identity */}
          <Space direction="vertical" size="small">
            <Text type="secondary">
              {t('home:enterpriseFluxNodeStart.ssp_identity')}:
            </Text>
            <Text
              strong
              style={{
                fontFamily: 'var(--ssp-mono)',
                fontSize: '12px',
                wordBreak: 'break-all',
              }}
            >
              {wkIdentity}
            </Text>
          </Space>

          {/* VD: the vault verified on this device, the collateral derived. */}
          <VaultDescriptorStatus
            state={vaultGate.state}
            sourceAddress={collateralCheck?.ok ? collateralCheck.address : null}
            checkError={
              collateralCheck && !collateralCheck.ok
                ? collateralCheck.error
                : null
            }
          />

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
              message={t('home:enterpriseFluxNodeStart.waiting_for_key')}
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
              onClick={() => {
                void handleApprove();
              }}
              loading={processing && !waitingForKey}
              disabled={processing || waitingForKey || !vaultReady}
            >
              {waitingForKey
                ? t('home:enterpriseFluxNodeStart.awaiting_key')
                : t('home:enterpriseFluxNodeStart.approve')}
            </Button>
            <Button
              type="link"
              block
              size="small"
              onClick={handleCancel}
              disabled={processing && !waitingForKey}
            >
              {t('common:cancel')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default EnterpriseFluxNodeStart;
