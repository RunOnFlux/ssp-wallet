import { useAppSelector } from '../../hooks';
import { Typography } from 'antd';
const { Paragraph, Text } = Typography;

function AddressContainer() {
  const { wallets } = useAppSelector((state) => state.flux);

  return (
    <>
      <Paragraph copyable={{ text: wallets['0-0'].address }} className="copyableAddress">
        <Text>
          {wallets['0-0'].address.substring(0, 7)}...{wallets['0-0'].address.substring(wallets['0-0'].address.length - 6)}
        </Text>
      </Paragraph>
    </>
  );
}

export default AddressContainer;
