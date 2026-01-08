import { Card, Badge, Avatar, Flex } from 'antd';
const { Meta } = Card;
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import './AssetBox.css';

function AssetBox(props: { asset: string }) {
  const { asset } = props;
  const { t } = useTranslation(['home', 'common']);
  return (
    <>
      <Card hoverable style={{ marginTop: 5 }} size="small">
        <Meta
          avatar={
            <div style={{ marginTop: '12px' }}>
              <Badge
                count={
                  <Avatar
                    src={blockchains[asset.split('_')[0]]?.logo}
                    size={18}
                  />
                }
                size="small"
                offset={[-2, 5]}
              >
                <Avatar
                  src={
                    blockchains[asset.split('_')[0]].tokens?.find(
                      (token) => token.symbol === asset.split('_')[1],
                    )?.logo ?? blockchains[asset.split('_')[0]]?.logo
                  }
                  size={30}
                />
              </Badge>
            </div>
          }
          title={
            <>
              <div style={{ float: 'left' }}>
                {blockchains[asset.split('_')[0]].tokens?.find(
                  (token) => token.symbol === asset.split('_')[1],
                )?.symbol ?? blockchains[asset.split('_')[0]]?.symbol}
              </div>
            </>
          }
          description={
            <>
              <Flex
                justify="space-between"
                align="flex-start"
                style={{ width: '100%' }}
              >
                <div className="asset-box-chain-name">
                  {blockchains[asset.split('_')[0]].tokens?.find(
                    (token) => token.symbol === asset.split('_')[1],
                  )?.name ?? blockchains[asset.split('_')[0]]?.name}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    textAlign: 'right',
                    flexShrink: 0,
                    float: 'right',
                    marginTop: '-14px',
                  }}
                >
                  {blockchains[asset.split('_')[0]]?.name}
                  <br />
                  {t('common:chain')}
                </div>
              </Flex>
            </>
          }
        />
      </Card>
    </>
  );
}

export default AssetBox;
