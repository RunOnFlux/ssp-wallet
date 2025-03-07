import { Row, Col, Image } from 'antd';
import { blockchains } from '@storage/blockchains';
import './AssetBox.css';

function AssetBox(props: { asset: string }) {
  const { asset } = props;
  return (
    <Row gutter={[16, 16]} className="abe-asset" key={asset}>
      <Col span={6} className="abe-asset-logo">
        <Image
          height={20}
          width={20}
          preview={false}
          src={
            blockchains[asset.split('_')[0]].tokens?.find(
              (token) => token.symbol === asset.split('_')[1],
            )?.logo ?? blockchains[asset.split('_')[0]]?.logo
          }
        />
        <Image
          height={20}
          width={20}
          preview={false}
          src={blockchains[asset.split('_')[0]]?.logo}
        />
      </Col>
      <Col span={10} className="abe-asset-title">
        {blockchains[asset.split('_')[0]].tokens?.find(
          (token) => token.symbol === asset.split('_')[1],
        )?.symbol ?? blockchains[asset.split('_')[0]]?.symbol}
        {blockchains[asset.split('_')[0]].tokens?.find(
          (token) => token.symbol === asset.split('_')[1],
        )?.name ?? blockchains[asset.split('_')[0]]?.name}
      </Col>
      <Col span={8} className="abe-asset-chain">
        {blockchains[asset.split('_')[0]]?.name}
      </Col>
    </Row>
  );
}

export default AssetBox;
