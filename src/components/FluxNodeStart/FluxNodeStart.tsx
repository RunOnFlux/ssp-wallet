import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Button, Space, Modal, Alert } from 'antd';
import { fluxnode } from '@runonflux/flux-sdk';
import { useAppSelector } from '../../hooks';
import { cryptos } from '../../types';
import { blockchains } from '@storage/blockchains';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import type { WkSignRequesterInfo } from '../../lib/wkSign';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { getFingerprint } from '../../lib/fingerprint';
import '../EnterpriseFluxNodeStart/EnterpriseFluxNodeStart.css';

const { Text } = Typography;

interface FluxNodeStartResponse {
  status: string;
  result?: { signedTxHex: string };
  data?: string;
}

interface FluxNodeStartProps {
  open: boolean;
  openAction: (data: FluxNodeStartResponse | null) => void;
  requesterInfo: WkSignRequesterInfo | null;
  chain: string;
  collateralAddress: string;
  collateralTxid: string;
  collateralVout: number;
  collateralAmount: string;
  identityPubKey: string;
  nodeName: string;
  delegates: string[];
}

/**
 * Consumer variant of EnterpriseFluxNodeStart. Signs a Flux node start with
 * the collateral key of a regular wallet address (account 0'). The collateral
 * address must belong to this wallet — derivation indices and the redeem
 * script come from the wallet's own records, never from the requesting page.
 */
function FluxNodeStart({
  open,
  openAction,
  requesterInfo,
  chain,
  collateralAddress,
  collateralTxid,
  collateralVout,
  collateralAmount,
  identityPubKey,
  nodeName,
  delegates,
}: FluxNodeStartProps) {
  const { t } = useTranslation(['home', 'common']);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const fluxWallets = useAppSelector((state) => state.flux.wallets);
  const fluxTestnetWallets = useAppSelector(
    (state) => state.fluxTestnet.wallets,
  );
  const wallets = chain === 'fluxTestnet' ? fluxTestnetWallets : fluxWallets;

  const chainConfig = chain ? blockchains[chain as keyof cryptos] : null;

  const walletEntry = Object.entries(wallets ?? {}).find(
    ([, w]) => w.address === collateralAddress,
  );

  const resetState = useCallback(() => {
    setProcessing(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  /**
   * Derive the collateral keypair for the wallet holding the collateral.
   * Path: m/48'/coin'/0'/scriptType'/{typeIndex}/{addressIndex}
   */
  const deriveCollateralKeypair = async (walletInUse: string) => {
    if (!passwordBlob)
      throw new Error(t('home:fluxNodeStart.err_not_logged_in'));
    if (!chainConfig)
      throw new Error(t('home:fluxNodeStart.err_invalid_chain'));

    const xprivEncrypted = secureLocalStorage.getItem(
      `xpriv-48-${chainConfig.slip}-0-${getScriptType(
        chainConfig.scriptType,
      )}-${chainConfig.id}`,
    );
    if (!xprivEncrypted || typeof xprivEncrypted !== 'string') {
      throw new Error(t('home:fluxNodeStart.err_xpriv_unavailable'));
    }

    const fingerprint = getFingerprint();
    let password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error(t('home:fluxNodeStart.err_decrypt_password'));
    }

    let xpriv = await passworderDecrypt(password, xprivEncrypted);
    password = '';
    if (typeof xpriv !== 'string') {
      throw new Error(t('home:fluxNodeStart.err_decrypt_xpriv'));
    }

    const splittedDerPath = walletInUse.split('-');
    const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
    const addressIndex = Number(splittedDerPath[1]);

    const keypair = generateAddressKeypair(
      xpriv,
      typeIndex,
      addressIndex,
      chain as keyof cryptos,
    );
    xpriv = '';

    return keypair;
  };

  const handleCancel = () => {
    if (processing) return;
    openAction(null);
    resetState();
  };

  const handleApprove = async () => {
    setProcessing(true);
    setError(null);

    let collateralPrivKey = '';

    try {
      if (!walletEntry) {
        throw new Error(t('home:fluxNodeStart.err_address_not_found'));
      }
      const [walletInUse, wallet] = walletEntry;
      if (!wallet.redeemScript) {
        throw new Error(t('home:fluxNodeStart.err_redeem_unavailable'));
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();

      let delegateData;
      if (delegates.length > 0) {
        delegateData = { version: 1, type: 1, delegatePublicKeys: delegates };
      }

      const keypair = await deriveCollateralKeypair(walletInUse);
      collateralPrivKey = keypair.privKey;

      const signedTxHex = fluxnode.startFluxNodev6WithPubKey(
        collateralTxid,
        collateralVout,
        collateralPrivKey,
        identityPubKey,
        timestamp,
        true,
        wallet.redeemScript,
        delegateData,
      );

      collateralPrivKey = '';

      openAction({
        status: 'SUCCESS',
        result: { signedTxHex },
      });
      resetState();
    } catch (err) {
      collateralPrivKey = '';
      console.error('[FluxNodeStart] Error:', err);
      setError(
        err instanceof Error ? err.message : t('home:fluxNodeStart.err_failed'),
      );
      setProcessing(false);
    }
  };

  const amountFlux = collateralAmount
    ? (parseInt(collateralAmount, 10) / 1e8).toFixed(2)
    : '?';
  const chainLabel = chainConfig
    ? `${chainConfig.name} (${chainConfig.symbol})`
    : chain;
  const utxoFull = collateralTxid ? `${collateralTxid}:${collateralVout}` : '';
  const utxoDisplay = collateralTxid
    ? `${collateralTxid.slice(0, 10)}…${collateralTxid.slice(-8)}:${collateralVout}`
    : '';

  return (
    <Modal
      title={t('home:fluxNodeStart.title')}
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
        <Text>{t('home:fluxNodeStart.description')}</Text>

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
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {nodeName && (
                <div>
                  <Text type="secondary">{t('home:fluxNodeStart.node')}: </Text>
                  <Text strong>{nodeName}</Text>
                </div>
              )}
              <div>
                <Text type="secondary">{t('home:fluxNodeStart.chain')}: </Text>
                <Text strong>{chainLabel}</Text>
              </div>
              <div>
                <Text type="secondary">
                  {t('home:fluxNodeStart.collateral')}:{' '}
                </Text>
                <Text strong>{amountFlux} FLUX</Text>
              </div>
              <div>
                <Text type="secondary">
                  {t('home:fluxNodeStart.collateral_address')}:{' '}
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
              {utxoDisplay && (
                <div>
                  <Text type="secondary">
                    {t('home:fluxNodeStart.collateral_utxo')}:{' '}
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
              {delegates.length > 0 && (
                <div>
                  <Text type="secondary">
                    {t('home:fluxNodeStart.delegates')}:{' '}
                  </Text>
                  <Space direction="vertical" size={0}>
                    {delegates.map((d) => (
                      <Text
                        key={d}
                        strong
                        copyable={{ text: d }}
                        style={{ fontFamily: 'var(--ssp-mono)', fontSize: 12 }}
                      >
                        {`${d.slice(0, 10)}…${d.slice(-8)}`}
                      </Text>
                    ))}
                  </Space>
                </div>
              )}
            </Space>
          </div>
        </Space>

        {/* Delegate permission notice */}
        {delegates.length > 0 && (
          <Alert
            type="warning"
            message={t('home:fluxNodeStart.delegate_notice')}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Collateral address not in this wallet */}
        {!walletEntry && (
          <Alert
            type="error"
            message={t('home:fluxNodeStart.err_address_not_found')}
            showIcon
            style={{ textAlign: 'left' }}
          />
        )}

        {/* Error display */}
        {error && (
          <Alert
            type="error"
            message={error}
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
            loading={processing}
            disabled={processing || !walletEntry}
          >
            {t('home:fluxNodeStart.approve')}
          </Button>
          <Button
            type="link"
            block
            size="small"
            onClick={handleCancel}
            disabled={processing}
          >
            {t('common:cancel')}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}

export default FluxNodeStart;
