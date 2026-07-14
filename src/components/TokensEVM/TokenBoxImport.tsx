import { Card, Avatar, Checkbox, Badge, Button } from 'antd';
import { toast } from '../../lib/toast';
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
  const triggerAction = (contract: string, value: boolean) => {
    if (props.notSelectable) {
      return;
    }
    props.selectAction(contract, value);
  };

  const displayMessage = (type: NoticeType, content: string) => {
    void toast.open({
      type,
      content,
    });
  };

  const handleDelete = async (contract: string) => {
    try {
      console.log('delete', contract);
      // Solana SPL mints are case-significant base58; EVM contracts are
      // case-insensitive hex.
      const isSolana = blockchains[props.chain].chainType === 'sol';
      const neq = (a: string, b: string) =>
        isSolana ? a !== b : a.toLowerCase() !== b.toLowerCase();
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
        activatedTokensCurrentWallet.filter((item) => neq(item, contract)),
      );
      // remove from local storage of activatedTokens for ALL wallets (iterate from 0 to 19)
      for (let i = 0; i < 20; i++) {
        const activatedTokens: string[] =
          (await localForage.getItem(`activated-tokens-${props.chain}-${i}`)) ??
          [];
        if (activatedTokens.length > 0) {
          await localForage.setItem(
            `activated-tokens-${props.chain}-${i}`,
            activatedTokens.filter((item) => neq(item, contract)),
          );
        }
      }
      // delete this imported contract token from local storage of imported tokens
      const importedTokens: Token[] =
        (await localForage.getItem(`imported-tokens-${props.chain}`)) ?? [];
      await localForage.setItem(
        `imported-tokens-${props.chain}`,
        importedTokens.filter((item) => neq(item.contract, contract)),
      );
      // save importedTokens to redux
      setImportedTokens(
        props.chain,
        importedTokens.filter((item) => neq(item.contract, contract)),
      );
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:tokens.err_delete_token'));
    }
  };

  return (
    <div className="token-box-import-container">
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
            <div style={{ marginTop: '12px' }}>
              <Badge
                count={<Avatar src={blockchains[props.chain].logo} size={18} />}
                size="small"
                offset={[-2, 5]}
              >
                <Avatar src={props.tokenInfo.logo} size={30} />
              </Badge>
            </div>
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
