import { useAppSelector } from '../../hooks';
import { Typography } from 'antd';
const { Paragraph, Text } = Typography;

function AddressContainer() {
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );

  return (
    <div data-tutorial="wallet-address">
      <Paragraph
        copyable={{ text: wallets[walletInUse].address }}
        className="copyableAddress"
      >
        <Text>
          {wallets[walletInUse].address.substring(0, 8)}...
          {wallets[walletInUse].address.substring(
            wallets[walletInUse].address.length - 6,
          )}
        </Text>
      </Paragraph>
    </div>
  );
}

export default AddressContainer;
