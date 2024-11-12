import { Card, Avatar, Checkbox, Badge, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Token, blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';

import './TokenBoxImport.css';

const { Meta } = Card;

function TokenBoxImport(props: {
  chain: keyof cryptos;
  tokenInfo: Token;
  active: boolean;
  notSelectable: boolean;
  selectAction: (contract: string, value: boolean) => void;
  deletePossible?: boolean;
}) {
  const { t } = useTranslation(['home']);
  const triggerAction = (contract: string, value: boolean) => {
    if (props.notSelectable) {
      return;
    }
    props.selectAction(contract, value);
  };

  const handleDelete = (contract: string) => {
    console.log('delete', contract);
    // make sure it is unselected
    triggerAction(contract, false);
    // remove from any wallet of activatedTokens array
    // delete from local storage of imported tokens
    // reload to redux
  };

  return (
    <div
      style={{
        minWidth: '170px',
        width: 'calc(50% - 8px)',
        position: 'relative',
      }}
    >
      {props.deletePossible && (
        <Button
          type="default"
          danger
          size="small"
          title={t('home:tokens.delete_token')}
          onClick={() => handleDelete(props.tokenInfo.contract)}
          style={{
            position: 'absolute',
            left: '14px',
            bottom: '4px',
            zIndex: 10,
          }}
        >
          <DeleteOutlined />
        </Button>
      )}
      <Card
        className={props.notSelectable ? 'not-selectable' : ''}
        hoverable
        size="small"
        onClick={() => triggerAction(props.tokenInfo.contract, !props.active)}
      >
        <Meta
          avatar={
            <Badge
              count={<Avatar src={blockchains[props.chain].logo} size={18} />}
              size="small"
              offset={[-2, 5]}
            >
              <Avatar src={props.tokenInfo.logo} size={30} />
            </Badge>
          }
          title={
            <>
              <div style={{ float: 'left' }}>{props.tokenInfo.symbol}</div>
              <div style={{ float: 'right' }}>
                <Checkbox
                  checked={props.active}
                  onChange={(e) =>
                    triggerAction(props.tokenInfo.contract, e.target.checked)
                  }
                ></Checkbox>
              </div>
            </>
          }
          description={
            <>
              <div
                className={'token-box-import'}
                title={props.tokenInfo.name}
                style={{ textAlign: 'left', float: 'left' }}
              >
                {props.tokenInfo.name}
              </div>
            </>
          }
        />
      </Card>
    </div>
  );
}

export default TokenBoxImport;
