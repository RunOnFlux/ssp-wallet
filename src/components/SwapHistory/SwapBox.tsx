import { Card, Badge, Avatar, Flex, Button } from 'antd';
const { Meta } = Card;
import { useTranslation } from 'react-i18next';
import { MouseEvent, useState } from 'react';
import { blockchains } from '@storage/blockchains';
import './SwapBox.css';
import { exchangeProvider, swapHistoryOrder } from '../../types';
import {
  SwapLeftOutlined,
  SwapRightOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../../hooks';

function SwapBox(props: {
  swap: swapHistoryOrder;
  reverseAbeMapping: Record<string, string>;
}) {
  const { swap, reverseAbeMapping } = props;
  const { t } = useTranslation(['home', 'common']);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const sellAsset = reverseAbeMapping[swap.sellAsset];
  const buyAsset = reverseAbeMapping[swap.buyAsset];
  const { exchangeProviders } = useAppSelector((state) => state.abe);
  const provider: exchangeProvider = exchangeProviders.find(
    (provider) => provider.exchangeId === swap.exchangeId,
  ) ?? {
    name:
      swap.exchangeId
        .slice(
          2,
          swap.exchangeId.slice(-5) === 'float'
            ? swap.exchangeId.length - 5
            : swap.exchangeId.length - 3,
        )
        .charAt(0)
        .toUpperCase() +
      swap.exchangeId
        .slice(
          2,
          swap.exchangeId.slice(-5) === 'float'
            ? swap.exchangeId.length - 5
            : swap.exchangeId.length - 3,
        )
        .slice(1),
    exchangeId: swap.exchangeId,
    type: swap.exchangeId.slice(-5) === 'float' ? 'float' : 'fixed',
    website: '',
    endpoint: '',
    terms: '',
    privacy: '',
    kyc: '',
    track: '',
    logo: '',
  };

  const openDetails = (
    event: MouseEvent<HTMLDivElement, globalThis.MouseEvent>,
  ) => {
    const containingElement = document.querySelector('#swap-id' + swap.swapId);
    if (containingElement) {
      console.log('kappa');
      if (containingElement.contains(event.target as Node)) {
        // do not register clicks here
        return;
      }
    }
    setInfoExpanded(!infoExpanded);
  };

  const transformStatusToString = (status: string) => {
    if (status === 'pending') return t('home:swap.pending');
    if (status === 'completed') return t('home:swap.completed');
    if (status === 'failed') return t('home:swap.failed');
    if (status === 'refunded') return t('home:swap.refunded');
    if (status === 'hold') return t('home:swap.hold');
    if (status === 'expired') return t('home:swap.expired');
    if (status === 'unknown') return t('home:swap.unknown');
    if (status === 'new') return t('home:swap.new');
    if (status === 'waiting') return t('home:swap.waiting');
    if (status === 'confirming') return t('home:swap.confirming');
    if (status === 'sending') return t('home:swap.sending');
    if (status === 'finished') return t('home:swap.finished');
    return status;
  };

  const transformStatusToColor = (status: string) => {
    if (status === 'pending') return 'blue';
    if (status === 'completed') return 'green';
    if (status === 'failed') return 'red';
    if (status === 'refunded') return 'green';
    if (status === 'hold') return 'red';
    if (status === 'expired') return 'red';
    if (status === 'unknown') return 'blue';
    if (status === 'new') return 'blue';
    if (status === 'waiting') return 'blue';
    if (status === 'confirming') return 'blue';
    if (status === 'sending') return 'blue';
    if (status === 'finished') return 'green';
    return 'blue';
  };

  return (
    <>
      <Card
        hoverable
        className="swap-box-card-container"
        size="small"
        onClick={(e) => openDetails(e)}
      >
        <Meta
          title={
            <>
              <div className="swap-box-timestamp-status ant-card-meta-description">
                <div style={{ textAlign: 'left' }}>
                  {new Date(swap.createdAt).toLocaleDateString()}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Button
                    color={transformStatusToColor(swap.status)}
                    variant="filled"
                    size="small"
                  >
                    {transformStatusToString(swap.status)}
                  </Button>
                </div>
              </div>
              <div>
                <div style={{ float: 'left' }} className="swap-box-container">
                  <div>
                    <Badge
                      count={
                        <Avatar
                          src={
                            sellAsset
                              ? blockchains[sellAsset.split('_')[0]]?.logo
                              : null
                          }
                          size={18}
                        />
                      }
                      size="small"
                      offset={[-2, 5]}
                    >
                      <Avatar
                        src={
                          sellAsset
                            ? (blockchains[
                                sellAsset.split('_')[0]
                              ].tokens?.find(
                                (token) =>
                                  token.symbol === sellAsset.split('_')[1],
                              )?.logo ??
                              blockchains[sellAsset.split('_')[0]]?.logo)
                            : null
                        }
                        size={30}
                      />
                    </Badge>
                  </div>
                  <div>
                    {sellAsset
                      ? (blockchains[sellAsset.split('_')[0]].tokens?.find(
                          (token) => token.symbol === sellAsset.split('_')[1],
                        )?.symbol ??
                        blockchains[sellAsset.split('_')[0]]?.symbol)
                      : null}
                  </div>
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 'calc(50% - 15px)',
                    width: '30px',
                    top: '40px',
                  }}
                >
                  <SwapRightOutlined style={{ fontSize: '31px' }} />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 'calc(50% - 15px)',
                    width: '30px',
                    top: '47px',
                  }}
                >
                  <SwapLeftOutlined
                    style={{ rotate: '180deg', fontSize: '31px' }}
                  />
                </div>
                <div style={{ float: 'right' }} className="swap-box-container">
                  <div>
                    <Badge
                      count={
                        <Avatar
                          src={
                            buyAsset
                              ? blockchains[buyAsset.split('_')[0]]?.logo
                              : null
                          }
                          size={18}
                        />
                      }
                      size="small"
                      offset={[-2, 5]}
                    >
                      <Avatar
                        src={
                          buyAsset
                            ? (blockchains[buyAsset.split('_')[0]].tokens?.find(
                                (token) =>
                                  token.symbol === buyAsset.split('_')[1],
                              )?.logo ??
                              blockchains[buyAsset.split('_')[0]]?.logo)
                            : null
                        }
                        size={30}
                      />
                    </Badge>
                  </div>
                  <div>
                    {buyAsset
                      ? (blockchains[buyAsset.split('_')[0]].tokens?.find(
                          (token) => token.symbol === buyAsset.split('_')[1],
                        )?.symbol ??
                        blockchains[buyAsset.split('_')[0]]?.symbol)
                      : null}
                  </div>
                </div>
              </div>
            </>
          }
          description={
            <>
              <Flex vertical>
                <div>
                  <div className="swap-box-sell-amount">
                    {infoExpanded ? <CaretUpOutlined /> : <CaretDownOutlined />}
                    <span style={{ paddingLeft: '20px' }}>
                      {Number(swap.sellAmount)}
                    </span>
                  </div>
                  <div className="swap-box-buy-amount">
                    {Number(swap.buyAmount)}
                  </div>
                </div>
                {infoExpanded && (
                  <div className={'token-box'} id={'swap-id' + swap.swapId}>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.created_at')}:{' '}
                      {new Date(swap.createdAt).toLocaleDateString()},{' '}
                      {new Date(swap.createdAt).toLocaleTimeString()}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.rate')}: 1{' '}
                      {sellAsset
                        ? (blockchains[sellAsset.split('_')[0]].tokens?.find(
                            (token) => token.symbol === sellAsset.split('_')[1],
                          )?.symbol ??
                          blockchains[sellAsset.split('_')[0]]?.symbol)
                        : null}{' '}
                      = {swap.rate}{' '}
                      {buyAsset
                        ? (blockchains[buyAsset.split('_')[0]].tokens?.find(
                            (token) => token.symbol === buyAsset.split('_')[1],
                          )?.symbol ??
                          blockchains[buyAsset.split('_')[0]]?.symbol)
                        : null}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.swap_id')}: {swap.swapId}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.provider')}: {provider.name}{' '}
                      {provider.type.charAt(0).toUpperCase() +
                        provider.type.slice(1)}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.sell_address')}:{' '}
                      {swap.refundAddress || 'N/A'}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.buy_address')}: {swap.buyAddress || 'N/A'}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.sell_txid')}: {swap.sellTxid || 'N/A'}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('home:swap.buy_txid')}: {swap.buyTxid || 'N/A'}
                    </p>
                    {swap.refundTxid && (
                      <p style={{ margin: 0, wordBreak: 'break-all' }}>
                        {t('home:swap.refund_txid')}: {swap.refundTxid || 'N/A'}
                      </p>
                    )}
                    {provider.track && (
                      <Button
                        type="default"
                        size="small"
                        style={{ float: 'right' }}
                        onClick={() => {
                          window.open(
                            `${provider.track}${swap.swapId}`,
                            '_blank',
                          );
                        }}
                      >
                        {t('home:swap.track_swap')}
                      </Button>
                    )}
                  </div>
                )}
              </Flex>
            </>
          }
        />
      </Card>
    </>
  );
}

export default SwapBox;
