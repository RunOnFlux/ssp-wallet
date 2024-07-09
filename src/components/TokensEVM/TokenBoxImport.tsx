import { Card, Avatar } from 'antd';
import { Token } from '@storage/blockchains';
import { cryptos } from '../../types';

const { Meta } = Card;

function TokenBoxImport(props: {
  chain: keyof cryptos;
  tokenInfo: Token;
  active: boolean;
}) {
  return (
    <div>
      <Card hoverable style={{ width: '170px' }} size="small">
        <Meta
          avatar={<Avatar src={props.tokenInfo.logo} size={30} />}
          title={
            <>
              <div style={{ float: 'left' }}>{props.tokenInfo.symbol}</div>
            </>
          }
          description={
            <>
              <div style={{ float: 'left' }}>{props.tokenInfo.name}</div>
            </>
          }
        />
      </Card>
    </div>
  );
}

export default TokenBoxImport;
