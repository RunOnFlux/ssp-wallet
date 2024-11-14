import { Card, Avatar, Checkbox, Badge, Button, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Token, blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';
import { setActivatedTokens, setImportedTokens } from '../../store';

import './TokenBoxImport.css';

const { Meta } = Card;

function TokenBoxImport(props: {
  chain: keyof cryptos;
  walletInUse: string;
  tokenInfo: Token;
  active: boolean;
  notSelectable: boolean;
  selectAction: (contract: string, value: boolean) => void;
  deletePossible?: boolean;
}) {
  const { t } = useTranslation(['home']);
  const [messageApi, contextHolder] = message.useMessage();
  const triggerAction = (contract: string, value: boolean) => {
    if (props.notSelectable) {
      return;
    }
    props.selectAction(contract, value);
  };

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleDelete = async (contract: string) => {
    try {
      console.log('delete', contract);
      // make sure it is unselected
      triggerAction(contract, false);
      // remove from any wallet of activatedTokens array
      const activatedTokensCurrentWallet: string[] =
        (await localForage.getItem(
          `activated-tokens-${props.chain}-${props.walletInUse}`,
        )) ?? [];
      // remove from activatedTokens array for current wallet in redux
      setActivatedTokens(
        props.chain,
        props.walletInUse,
        activatedTokensCurrentWallet.filter(
          (item) => item.toLowerCase() !== contract.toLowerCase(),
        ),
      );
      // remove from local storage of activatedTokens for ALL wallets (iterate from 0 to 41)
      for (let i = 0; i < 42; i++) {
        const activatedTokens: string[] =
          (await localForage.getItem(`activated-tokens-${props.chain}-${i}`)) ??
          [];
        if (activatedTokens.length > 0) {
          await localForage.setItem(
            `activated-tokens-${props.chain}-${i}`,
            activatedTokens.filter(
              (item) => item.toLowerCase() !== contract.toLowerCase(),
            ),
          );
        }
      }
      // delete this imported contract token from local storage of imported tokens
      const importedTokens: Token[] =
        (await localForage.getItem(`imported-tokens-${props.chain}`)) ?? [];
      await localForage.setItem(
        `imported-tokens-${props.chain}`,
        importedTokens.filter(
          (item) => item.contract.toLowerCase() !== contract.toLowerCase(),
        ),
      );
      // save importedTokens to redux
      setImportedTokens(
        props.chain,
        importedTokens.filter(
          (item) => item.contract.toLowerCase() !== contract.toLowerCase(),
        ),
      );
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:tokens.err_delete_token'));
    }
  };

  return (
    <div
      style={{
        minWidth: '170px',
        width: 'calc(50% - 8px)',
        position: 'relative',
      }}
    >
      {contextHolder}
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
