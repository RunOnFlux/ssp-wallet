import { Card, Avatar, Flex } from 'antd';
const { Meta } = Card;
import BigNumber from 'bignumber.js';
import './ProviderBox.css';
import { selectedExchangeType } from '../../types';
import { formatCrypto } from '../../lib/currency';
import { useAppSelector } from '../../hooks';
import { getExchangeLogo } from '../../lib/exchangeLogos';
function ProviderBox(props: {
  provider: selectedExchangeType;
  buySymbol: string;
  sellSymbol: string;
}) {
  const { provider, buySymbol, sellSymbol } = props;
  const { exchangeProviders } = useAppSelector((state) => state.abe);
  const providerFound = exchangeProviders.find(
    (provider) => provider.exchangeId === props.provider.exchangeId,
  );
  return (
    <>
      <Card hoverable className="provider-box" size="small">
        <Meta
          avatar={
            <div style={{ marginTop: '12px' }}>
              <Avatar
                src={getExchangeLogo(providerFound?.name || '')}
                size={30}
              />
            </div>
          }
          title={
            <>
              <div style={{ float: 'left' }}>{providerFound?.name}</div>
              <div style={{ float: 'right' }}>
                {formatCrypto(new BigNumber(provider?.buyAmount ?? '0'), 8)}{' '}
                {buySymbol}
              </div>
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
                    1 {sellSymbol} = {Number(provider?.rate || 0)} {buySymbol}
                  </div>
                  <div
                    style={{
                      float: 'right',
                    }}
                  >
                    {providerFound
                      ? providerFound.type.charAt(0).toUpperCase() +
                        providerFound.type.slice(1)
                      : ''}
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

export default ProviderBox;
