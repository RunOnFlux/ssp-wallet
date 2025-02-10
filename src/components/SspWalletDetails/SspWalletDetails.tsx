import { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Button,
  Modal,
  message,
  Space,
  QRCode,
  Popconfirm,
  Tooltip,
} from 'antd';
import { NoticeType } from 'antd/es/message/interface';
const { Paragraph, Text } = Typography;
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  CopyOutlined,
  ExclamationCircleFilled,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { getScriptType } from '../../lib/wallet';

function SSPWalletDetails(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { activeChain, identityChain } = useAppSelector(
    (state) => state.sspState,
  );
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const blockchainConfig = blockchains[activeChain];
  const identityChainConfig = blockchains[identityChain];
  const { t } = useTranslation(['home', 'common', 'cr']);
  const [xpriv, setXpriv] = useState('');
  const [xpub, setXpub] = useState('');
  const [xpubIdentity, setXpubIdentity] = useState('');
  const [seedPhrase, setSeedPhrase] = useState<Uint8Array>(new Uint8Array());
  const [extendedPublicKeyVisible, setExtendedPublicKeyVisible] =
    useState(false);
  const [chainSyncKeyVisible, setChainSyncKeyVisible] = useState(false);
  const [extendedPrivateKeyVisible, setExtendedPrivateKeyVisible] =
    useState(false);
  const [sspSyncKeyVisible, setSspSyncKeyVisible] = useState(false);
  const [seedPhraseVisible, setSeedPhraseVisible] = useState(false);
  const [seedPhraseCopyingVisible, setSeedPhraseCopyingVisible] =
    useState(false);
  const [xprivCopyingVisible, setXprivCopyingVisible] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  // SSP is seedPhrase, xpub, xpriv
  const { open, openAction } = props;
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    if (!open) {
      seedPhrase.fill(0);
      setSeedPhrase(new Uint8Array());
      setXpriv('');
      setXpub('');
      setXpubIdentity('');
      console.log('reset state');
    }
  }, [open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '10px Tahoma';
        ctx.fillStyle = darkModePreference.matches ? '#fff' : '#000';
        new TextDecoder()
          .decode(seedPhrase)
          .split(' ')
          .forEach((word, index) => {
            const x = (index % 4) * 90 + 5; // Adjust x position for 4 words per row
            const y = Math.floor(index / 4) * 30 + 20; // Adjust y position for each row
            ctx.fillText(`${index + 1}.`, x, y); // Smaller number above the word
            ctx.font = '16px Tahoma'; // Larger font for the word
            ctx.fillText(seedPhraseVisible ? word : '*****', x + 20, y);
            ctx.font = '10px Tahoma'; // Reset font for the next number
          });
      }
    }
  }, [seedPhrase, seedPhraseVisible, open]);

  useEffect(() => {
    if (open) {
      generateAddressInformation();
    }
  }, [activeChain, open]);

  const handleOk = () => {
    setExtendedPrivateKeyVisible(false);
    setExtendedPublicKeyVisible(false);
    setChainSyncKeyVisible(false);
    setSspSyncKeyVisible(false);
    setSeedPhraseVisible(false);
    openAction(false);
  };

  const generateAddressInformation = () => {
    // get our password to decrypt xpriv from secure storage
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_pw_not_valid'));
        }
        const xprivBlob = secureLocalStorage.getItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xprivBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpriv'));
        }
        const xprivChain = await passworderDecrypt(password, xprivBlob);
        if (typeof xprivChain !== 'string') {
          throw new Error(
            t('home:sspWalletDetails.err_invalid_wallet_xpriv_2'),
          );
        }
        setXpriv(xprivChain);

        const xpubBlob = secureLocalStorage.getItem(
          `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xpubBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpub'));
        }
        const xpubChain = await passworderDecrypt(password, xpubBlob);
        if (typeof xpubChain !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_xpub_2'));
        }
        setXpub(xpubChain);

        const xpubBlobIdentity = secureLocalStorage.getItem(
          `xpub-48-${identityChainConfig.slip}-0-${getScriptType(
            identityChainConfig.scriptType,
          )}-${identityChainConfig.id}`,
        );
        if (typeof xpubBlobIdentity !== 'string') {
          throw new Error(
            t('home:sspWalletDetails.err_invalid_wallet_xpub_id'),
          );
        }
        const xpubChainIdentity = await passworderDecrypt(
          password,
          xpubBlobIdentity,
        );
        if (typeof xpubChainIdentity !== 'string') {
          throw new Error(
            t('home:sspWalletDetails.err_invalid_wallet_xpub_2_id'),
          );
        }
        setXpubIdentity(xpubChainIdentity);

        const walletSeedBlob = secureLocalStorage.getItem('walletSeed');
        if (typeof walletSeedBlob !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_seed'));
        }
        let walletSeed = await passworderDecrypt(password, walletSeedBlob);
        if (typeof walletSeed !== 'string') {
          throw new Error(t('home:sspWalletDetails.err_invalid_wallet_seed_2'));
        }
        setSeedPhrase(new TextEncoder().encode(walletSeed));
        // reassign walletSeed to null as it is no longer needed
        walletSeed = null;
      })
      .catch((error) => {
        console.log(error);
        displayMessage('error', t('home:sspWalletDetails.err_s1'));
      });
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:sspWalletDetails.ssp_bip', {
          chain: blockchainConfig.symbol,
        })}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:ok')}
          </Button>,
        ]}
      >
        <h3 className="detailsTitleWithDescription">
          {chainSyncKeyVisible && (
            <EyeTwoTone onClick={() => setChainSyncKeyVisible(false)} />
          )}
          {!chainSyncKeyVisible && (
            <EyeInvisibleOutlined
              onClick={() => setChainSyncKeyVisible(true)}
            />
          )}{' '}
          {t('home:sspWalletDetails.chain_sync_ssp_key', {
            chain: blockchainConfig.name,
          })}
          :
        </h3>
        <Paragraph type="secondary" className="detailsDescription">
          <blockquote>
            {t('home:sspWalletDetails.chain_sync_ssp_key_desc', {
              chain: blockchainConfig.name,
            })}
          </blockquote>
        </Paragraph>
        <Space direction="vertical" size="small">
          {chainSyncKeyVisible && (
            <QRCode
              errorLevel="H"
              value={activeChain + ':' + xpub}
              icon="/ssp-logo-black.svg"
              size={256}
              style={{ margin: '0 auto' }}
            />
          )}
          <Paragraph
            copyable={{ text: activeChain + ':' + xpub }}
            className="copyableAddress"
          >
            <Text>
              {chainSyncKeyVisible
                ? activeChain + ':' + xpub
                : '*** *** *** *** *** ***'}
            </Text>
          </Paragraph>
        </Space>
        <h3 className="detailsTitleWithDescription">
          {extendedPublicKeyVisible && (
            <EyeTwoTone onClick={() => setExtendedPublicKeyVisible(false)} />
          )}
          {!extendedPublicKeyVisible && (
            <EyeInvisibleOutlined
              onClick={() => setExtendedPublicKeyVisible(true)}
            />
          )}{' '}
          {t('home:sspWalletDetails.chain_extended_pub', {
            chain: blockchainConfig.name,
          })}
          :
        </h3>
        <Paragraph type="secondary" className="detailsDescription">
          <blockquote>
            {t('home:sspWalletDetails.chain_extended_pub_desc', {
              chain: blockchainConfig.name,
            })}
          </blockquote>
        </Paragraph>
        <Space direction="vertical" size="small">
          <Paragraph copyable={{ text: xpub }} className="copyableAddress">
            <Text>
              {extendedPublicKeyVisible ? xpub : '*** *** *** *** *** ***'}
            </Text>
          </Paragraph>
        </Space>
        <h3 className="detailsTitleWithDescription">
          {extendedPrivateKeyVisible && (
            <EyeTwoTone onClick={() => setExtendedPrivateKeyVisible(false)} />
          )}
          {!extendedPrivateKeyVisible && (
            <Popconfirm
              title={t('home:sspWalletDetails.show_data', {
                data: t('home:sspWalletDetails.chain_extended_priv', {
                  chain: blockchainConfig.name,
                }),
              })}
              description={
                <Space
                  direction="vertical"
                  size={'middle'}
                  style={{ marginTop: 12, marginBottom: 12 }}
                >
                  <span>
                    {t('cr:show_sensitive_data', {
                      sensitive_data: t(
                        'home:sspWalletDetails.chain_extended_priv',
                        {
                          chain: blockchainConfig.name,
                        },
                      ),
                    })}
                  </span>
                  <span>{t('cr:copy_anyone_can_read')}</span>
                </Space>
              }
              overlayStyle={{ maxWidth: 360, margin: 10 }}
              okText={t('common:confirm')}
              cancelText={t('common:cancel')}
              onConfirm={() => {
                setExtendedPrivateKeyVisible(true);
              }}
              icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
            >
              <EyeInvisibleOutlined />
            </Popconfirm>
          )}{' '}
          {t('home:sspWalletDetails.chain_extended_priv', {
            chain: blockchainConfig.name,
          })}
          :
        </h3>
        <Paragraph type="secondary" className="detailsDescription">
          <blockquote>
            {t('home:sspWalletDetails.chain_extended_priv_desc', {
              chain: blockchainConfig.name,
            })}
          </blockquote>
        </Paragraph>
        <Space direction="vertical" size="small">
          <Paragraph className="copyableAddress">
            <Text>
              {extendedPrivateKeyVisible ? xpriv : '*** *** *** *** *** ***'}{' '}
              <Tooltip title={'Copy'}>
                <Button
                  type="link"
                  size="small"
                  color="primary"
                  className="copyableIcon"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    setXprivCopyingVisible(true);
                  }}
                ></Button>
              </Tooltip>
            </Text>
          </Paragraph>
        </Space>
        <h3 className="detailsTitleWithDescription">
          {sspSyncKeyVisible && (
            <EyeTwoTone onClick={() => setSspSyncKeyVisible(false)} />
          )}
          {!sspSyncKeyVisible && (
            <EyeInvisibleOutlined onClick={() => setSspSyncKeyVisible(true)} />
          )}{' '}
          {t('home:sspWalletDetails.ssp_sync_wallet_key')}:
        </h3>
        <Paragraph type="secondary" className="detailsDescription">
          <blockquote>
            {t('home:sspWalletDetails.ssp_sync_wallet_key_desc')}
          </blockquote>
        </Paragraph>
        <Space direction="vertical" size="small">
          {sspSyncKeyVisible && (
            <QRCode
              errorLevel="H"
              value={xpubIdentity}
              icon="/ssp-logo-black.svg"
              size={256}
              style={{ margin: '0 auto' }}
            />
          )}
          <Paragraph
            copyable={{ text: xpubIdentity }}
            className="copyableAddress"
          >
            <Text>
              {sspSyncKeyVisible ? xpubIdentity : '*** *** *** *** *** ***'}
            </Text>
          </Paragraph>
        </Space>
        <h3 className="detailsTitleWithDescription">
          {seedPhraseVisible && (
            <EyeTwoTone onClick={() => setSeedPhraseVisible(false)} />
          )}
          {!seedPhraseVisible && (
            <Popconfirm
              title={t('home:sspWalletDetails.show_data', {
                data: t('home:sspWalletDetails.ssp_mnemonic'),
              })}
              description={
                <>
                  {t('cr:show_sensitive_data', {
                    sensitive_data: t('home:sspWalletDetails.ssp_mnemonic'),
                  })}
                </>
              }
              overlayStyle={{ maxWidth: 360, margin: 10 }}
              okText={t('common:confirm')}
              cancelText={t('common:cancel')}
              onConfirm={() => {
                setSeedPhraseVisible(true);
              }}
              icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
            >
              <EyeInvisibleOutlined />
            </Popconfirm>
          )}{' '}
          {t('home:sspWalletDetails.ssp_mnemonic')}:
        </h3>
        <Paragraph type="secondary" className="detailsDescription">
          <blockquote>
            {t('home:sspWalletDetails.ssp_mnemonic_desc')}
          </blockquote>
        </Paragraph>
        <Space direction="vertical" size="small">
          <canvas
            ref={canvasRef}
            width={366}
            height={180}
            style={{
              border: `0.5px solid ${
                darkModePreference.matches ? '#fff' : '#000'
              }`,
              marginLeft: '-5px',
            }}
          />
          <Popconfirm
            title={t('home:sspWalletDetails.copy_data', {
              data: t('home:sspWalletDetails.ssp_mnemonic'),
            })}
            description={
              <Space
                direction="vertical"
                size={'middle'}
                style={{ marginTop: 12, marginBottom: 12 }}
              >
                <span>
                  {t('cr:copy_sensitive_data_desc', {
                    sensitive_data: t('cr:wallet_seed_phrase'),
                  })}
                </span>
                <span>{t('cr:copy_anyone_can_read')}</span>
              </Space>
            }
            overlayStyle={{ maxWidth: 360, margin: 10 }}
            okText={t('common:confirm')}
            cancelText={t('common:cancel')}
            onConfirm={() => {
              setSeedPhraseCopyingVisible(true);
            }}
            icon={<ExclamationCircleFilled style={{ color: 'orange' }} />}
          >
            <Button type="dashed" icon={<CopyOutlined />}>
              {t('home:sspWalletDetails.copy_data', {
                data: t('home:sspWalletDetails.ssp_mnemonic'),
              })}
            </Button>
          </Popconfirm>
          <br />
        </Space>
      </Modal>
      <Modal
        title={t('cr:copy_wallet_seed')}
        open={seedPhraseCopyingVisible}
        onOk={() => setSeedPhraseCopyingVisible(false)}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={() => setSeedPhraseCopyingVisible(false)}
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setSeedPhraseCopyingVisible(false)}
          >
            {t('cr:finished')}
          </Button>,
        ]}
      >
        <h3>{t('cr:seed_phrase_split')}</h3>
        <Space direction="vertical" size="middle">
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                new TextDecoder().decode(
                  seedPhrase.slice(0, Math.round(seedPhrase.length / 3)),
                ),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 1 })}
          </Button>
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                new TextDecoder().decode(
                  seedPhrase.slice(
                    Math.round(seedPhrase.length / 3),
                    Math.round(seedPhrase.length / 3) * 2,
                  ),
                ),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 2 })}
          </Button>
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                new TextDecoder().decode(
                  seedPhrase.slice(
                    Math.round(seedPhrase.length / 3) * 2,
                    seedPhrase.length,
                  ),
                ),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 3 })}
          </Button>
        </Space>
      </Modal>
      <Modal
        title={t('cr:copy_sensitive_data', {
          sensitive_data: t('home:sspWalletDetails.chain_extended_priv', {
            chain: blockchainConfig.name,
          }),
        })}
        open={xprivCopyingVisible}
        onOk={() => setXprivCopyingVisible(false)}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={() => setXprivCopyingVisible(false)}
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setXprivCopyingVisible(false)}
          >
            {t('cr:finished')}
          </Button>,
        ]}
      >
        <h3>
          {t('cr:copy_sensitive_data_split', {
            sensitive_data: t('home:sspWalletDetails.chain_extended_priv', {
              chain: blockchainConfig.name,
            }),
          })}
        </h3>
        <Space direction="vertical" size="middle">
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                xpriv.substring(0, Math.round(xpriv.length / 2)),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 1 })}
          </Button>
          <Button
            type="dashed"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(
                xpriv.substring(Math.round(xpriv.length / 2), xpriv.length),
              );
              displayMessage('success', t('cr:copied'));
            }}
          >
            {t('cr:copy_part_x', { part: 2 })}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default SSPWalletDetails;
