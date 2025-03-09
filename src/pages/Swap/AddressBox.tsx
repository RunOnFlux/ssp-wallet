import { Card, Badge, Avatar, Flex } from 'antd';
const { Meta } = Card;
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import './AddressBox.css';

function AddressBox(props: { asset: string; wallet: string; address: string }) {
  const { asset, wallet, address } = props;
  const { t } = useTranslation(['home', 'common']);
  return (
    <>
      <Card hoverable style={{ marginTop: 5, width: '350px' }} size="small">
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
                {(+wallet.split('-')[0] === 1
                  ? t('common:change')
                  : t('common:wallet')) +
                  ' ' +
                  (+wallet.split('-')[1] + 1).toString()}
              </div>
              <div style={{ float: 'right' }}>CRYPTO VALUE</div>
            </>
          }
          description={
            <>
              <Flex vertical>
                <div>
                  <div
                    style={{
                      float: 'left',
                    }}
                  >
                    {address.substring(0, 10)}...
                    {address.substring(address.length - 9)}
                  </div>
                  <div
                    style={{
                      float: 'right',
                    }}
                  >
                    {blockchains[asset.split('_')[0]].tokens?.find(
                      (token) => token.symbol === asset.split('_')[1],
                    )?.symbol ?? blockchains[asset.split('_')[0]]?.symbol}
                  </div>
                </div>
              </Flex>
            </>
          }
        />
      </Card>
    </>
  );
}

export default AddressBox;
