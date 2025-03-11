import { Card, Badge, Avatar, Flex } from 'antd';
const { Meta } = Card;
import { useTranslation } from 'react-i18next';
import { MouseEvent, useState } from 'react';
import { blockchains } from '@storage/blockchains';
import './SwapBox.css';
import { swapHistoryOrder } from '../../types';
import {
  SwapLeftOutlined,
  SwapRightOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
} from '@ant-design/icons';

function SwapBox(props: {
  swap: swapHistoryOrder;
  reverseAbeMapping: Record<string, string>;
}) {
  const { swap, reverseAbeMapping } = props;
  const { t } = useTranslation(['home', 'common']);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const sellAsset = reverseAbeMapping[swap.sellAsset];
  const buyAsset = reverseAbeMapping[swap.buyAsset];

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
  return (
    <>
      <Card
        hoverable
        style={{ marginTop: 5, width: '350px' }}
        size="small"
        onClick={(e) => openDetails(e)}
      >
        <Meta
          title={
            <>
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
                          ? (blockchains[sellAsset.split('_')[0]].tokens?.find(
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
                      )?.symbol ?? blockchains[sellAsset.split('_')[0]]?.symbol)
                    : null}
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 'calc(50% - 15px)',
                  width: '30px',
                  top: '20px',
                }}
              >
                <SwapRightOutlined style={{ fontSize: '31px' }} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 'calc(50% - 15px)',
                  width: '30px',
                  top: '27px',
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
                      )?.symbol ?? blockchains[buyAsset.split('_')[0]]?.symbol)
                    : null}
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
                      {t('common:contract')}
                      {buyAsset}
                    </p>
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
