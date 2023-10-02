import { useAppSelector } from '../../hooks';
import { Typography } from 'antd';
const { Paragraph, Text } = Typography;

function AddressContainer() {
  const { wallets, walletInUse } = useAppSelector((state) => state.flux);

  return (
    <>
      <Paragraph copyable={{ text: wallets[walletInUse].address }} className="copyableAddress">
        <Text>
          {wallets[walletInUse].address.substring(0, 7)}...{wallets[walletInUse].address.substring(wallets[walletInUse].address.length - 6)}
        </Text>
      </Paragraph>
    </>
  );
}

export default AddressContainer;
