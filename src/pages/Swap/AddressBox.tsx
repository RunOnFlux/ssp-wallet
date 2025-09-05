import { useEffect, useState } from 'react';
import { Card, Badge, Avatar, Flex } from 'antd';
const { Meta } = Card;
import BigNumber from 'bignumber.js';
import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';
import './AddressBox.css';
import { tokenBalanceEVM } from '../../types';
import { formatCrypto } from '../../lib/currency';
import { getDisplayName } from '../../storage/walletNames';
import { cryptos } from '../../types';

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

function AddressBox(props: { asset: string; wallet: string; address: string }) {
  const { asset, wallet, address } = props;
  const [balance, setBalance] = useState(new BigNumber(0));

  const blockchainConfig = blockchains[asset.split('_')[0]];

  useEffect(() => {
    void (async () => {
      if (asset.split('_')[2]) {
        const balancesTokens: tokenBalanceEVM[] | null =
          await localForage.getItem(
            `token-balances-${asset.split('_')[0]}-${wallet}`,
          );
        if (balancesTokens?.length) {
          const tokenBalExists = balancesTokens.find(
            (token) => token.contract === asset.split('_')[2],
          );
          if (tokenBalExists) {
            // search token in tokens of the blockchain
            const token = blockchainConfig.tokens?.find(
              (token) => token.contract === asset.split('_')[2],
            );
            setBalance(
              new BigNumber(tokenBalExists.balance).dividedBy(
                10 ** (token?.decimals ?? 0),
              ),
            );
          } else {
            setBalance(new BigNumber(0));
          }
        } else {
          setBalance(new BigNumber(0));
        }
      } else {
        const balancesWallet: balancesObj | null = await localForage.getItem(
          `balances-${asset.split('_')[0]}-${wallet}`,
        );
        if (balancesWallet) {
          const ttlBal = new BigNumber(balancesWallet.confirmed).dividedBy(
            10 ** blockchainConfig.decimals,
          );
          setBalance(ttlBal);
        } else {
          setBalance(new BigNumber(0));
        }
      }
    })();
  }, [asset, wallet, address]);
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
                {getDisplayName(asset.split('_')[0] as keyof cryptos, wallet)}
              </div>
              <div style={{ float: 'right' }}>{formatCrypto(balance, 12)}</div>
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
