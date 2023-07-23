import { useAppSelector } from '../../hooks';
import { Typography } from 'antd';
const { Paragraph, Text } = Typography;

function AddressContainer() {
  const { address } = useAppSelector((state) => state.flux);

  return (
    <>
      <Paragraph copyable={{ text: address }} className="copyableAddress">
        <Text>
          {address.substring(0, 7)}...{address.substring(address.length - 6)}
        </Text>
      </Paragraph>
    </>
  );
}

export default AddressContainer;
