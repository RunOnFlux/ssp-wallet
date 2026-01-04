import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAppSelector } from '../../hooks';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Space,
  Popconfirm,
  message,
  Spin,
  Typography,
  Tooltip,
} from 'antd';
const { Paragraph } = Typography;
import { fusionPAavailable, fusionMessage, errorResponse } from '../../types';
import { blockchains } from '@storage/blockchains';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { NoticeType } from 'antd/es/message/interface';
import { randomBytes } from 'crypto';
import { fluxnode } from '@runonflux/flux-sdk';
import ClaimReceived from './ClaimReceived.tsx';

import { wifToPrivateKey } from '../../lib/wallet.ts';

function PArewards(props: {
  redeemScript: string;
  collateralPrivKey: string;
  collateralPubKey: string;
  sspwid: string;
}) {
  const [txid, setTxid] = useState('');
  const [claimeReceived, setClaimReceived] = useState(false);
  const [paRewardsAvailable, setPaRewardsAvailable] = useState(0);
  const [paRewardsFee, setPaRewardsFee] = useState(0);
  const [claimInProgress, setClaimInProgress] = useState(false);
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const [messageApi, contextHolder] = message.useMessage();
  const address = wallets[walletInUse].address;
  const blockchainConfig = blockchains[activeChain];

  useEffect(() => {
    // Reset rewards state when wallet/chain changes
    setPaRewardsAvailable(0);
    setPaRewardsFee(0);
    // Fetch fresh rewards data
    refreshPArewards();
  }, [walletInUse, activeChain, props.sspwid]);

  useEffect(() => {
    if (txid) {
      setClaimReceived(true);
    }
  }, [txid]);

  const refreshPArewards = () => {
    console.log('refreshPArewards');
    axios
      .get<fusionPAavailable>(
        `https://fusion.runonflux.io/coinbase/multiavailable/${address}`,
        { headers: { fluxid: props.sspwid } },
      )
      .then((res) => {
        console.log(res);
        if (res.data.status !== 'success') {
          setPaRewardsAvailable(0);
          setPaRewardsFee(0);
          return;
        }
        const { totalReward, totalFee } = res.data.data;
        setPaRewardsAvailable(totalReward);
        setPaRewardsFee(totalFee);
        console.log(paRewardsFee);
      })
      .catch(() => {
        setPaRewardsAvailable(0);
        setPaRewardsFee(0);
        console.log('No rewards available');
      });
  };

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  /**
   * Signs the message with the private key.
   *
   * @param {string} message
   * @param {string} pk - private key
   *
   * @returns {string} signature
   */
  function signMessage(message: string, pk: string) {
    let signature;
    try {
      const isCompressed = true; // ssp always has compressed keys

      const privateKey = wifToPrivateKey(pk, activeChain);

      const messagePrefix = blockchainConfig.messagePrefix;

      // this is base64 encoded
      signature = fluxnode.signMessage(
        message,
        privateKey,
        isCompressed,
        messagePrefix,
        { extraEntropy: randomBytes(32) },
      );

      // => different (but valid) signature each time
    } catch (e) {
      console.log(e);
      signature = null;
    }
    return signature;
  }

  const proceedToClaim = () => {
    if (claimInProgress) {
      return;
    }
    setClaimInProgress(true);
    // first obtain message
    axios
      .get<fusionMessage>('https://fusion.runonflux.io/messagephrase')
      .then((res) => {
        if (res.data.status !== 'success') {
          displayMessage('error', t('home:fusion.fusion_maintenance'));
          setClaimInProgress(false);
          return;
        }
        const mes = res.data.data as string;
        const signature = signMessage(mes, props.collateralPrivKey);
        if (!signature) {
          displayMessage('error', t('home:fusion.signature_error'));
          setClaimInProgress(false);
          return;
        }
        // claim
        const claimData = {
          address: address,
          message: mes,
          signature: signature,
          redeemScript: props.redeemScript,
          publicKey: props.collateralPubKey,
          fluxid: props.sspwid,
        };

        axios
          .post<fusionMessage>(
            'https://fusion.runonflux.io/coinbase/multiclaim',
            claimData,
          )
          .then((resp) => {
            if (resp.data.status === 'success') {
              displayMessage('success', t('home:fusion.claim_successful'));
              refreshPArewards();
              // show txid information
              const incTxid = resp.data.data as string;
              console.log(incTxid);
              setTxid(incTxid);
            } else {
              const error = resp.data.data as errorResponse;
              displayMessage('error', error.message);
            }
            setClaimInProgress(false);
          })
          .catch((error) => {
            displayMessage('error', t('home:fusion.fusion_maintenance'));
            console.log(error);
            setClaimInProgress(false);
          });
      })
      .catch((error) => {
        displayMessage('error', t('home:fusion.fusion_maintenance'));
        console.log(error);
        setClaimInProgress(false);
      });
  };

  const claimReceivedAction = (status: boolean) => {
    setTxid('');
    setClaimReceived(status);
  };

  return (
    <>
      {contextHolder}
      {claimInProgress && (
        <Spin size="large" style={{ marginTop: 14, marginBottom: 14 }} />
      )}
      {!claimInProgress && (
        <Space
          size={'large'}
          style={{ marginTop: 8, marginBottom: 8, marginLeft: 4 }}
        >
          <div>
            <Tooltip title={t('home:fusion.pa_info')} placement="topLeft">
              <b style={{ cursor: 'help' }}>{t('home:fusion.pa_reward')}</b>
            </Tooltip>
            <br />{' '}
            {t('home:fusion.x_y_available', {
              amount: paRewardsAvailable,
              symbol: blockchainConfig.symbol,
            })}
          </div>
          <Popconfirm
            title={t('home:fusion.claim_pa_reward')}
            placement="topLeft"
            description={
              <>
                <Paragraph type="secondary" className="detailsDescription">
                  <blockquote>{t('home:fusion.pa_info')}</blockquote>
                </Paragraph>
                {t('home:fusion.total_to_claim', {
                  amount: Number(
                    (paRewardsAvailable + paRewardsFee).toFixed(8),
                  ),
                  symbol: blockchainConfig.symbol,
                })}
                <br />
                {t('home:fusion.fees_to_pay', {
                  amount: paRewardsFee,
                  symbol: blockchainConfig.symbol,
                })}
                <br />
                {t('home:fusion.total_reward', {
                  amount: paRewardsAvailable,
                  symbol: blockchainConfig.symbol,
                })}
                <br /> <br />
              </>
            }
            overlayStyle={{ maxWidth: 360, paddingLeft: 20 }}
            okText={t('home:fusion.claim_reward')}
            cancelText={t('common:cancel')}
            onConfirm={() => {
              proceedToClaim();
            }}
            icon={<QuestionCircleOutlined style={{ color: 'green' }} />}
          >
            <Button type="primary" size="middle" disabled={!paRewardsAvailable}>
              {t('home:fusion.claim_with_fusion')}
            </Button>
          </Popconfirm>
        </Space>
      )}
      <ClaimReceived
        open={claimeReceived}
        openAction={claimReceivedAction}
        txid={txid}
        chain={activeChain}
      />
    </>
  );
}

export default PArewards;
