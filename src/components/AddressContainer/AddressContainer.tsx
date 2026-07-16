import { useAppSelector } from '../../hooks';
import { Typography } from 'antd';
import { truncateAddress } from '../../lib/addressDisplay';
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
        <Text>{truncateAddress(wallets[walletInUse].address)}</Text>
      </Paragraph>
    </div>
  );
}

export default AddressContainer;
