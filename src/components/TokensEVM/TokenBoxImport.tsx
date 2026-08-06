import { Avatar, Checkbox, Badge, Button } from 'antd';
import { toast } from '../../lib/toast';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { Trash2 as Trash2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Token, blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';
import { setActivatedTokens, setImportedTokens } from '../../store';

import './TokenBoxImport.css';

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

  // v2 row/checkbox language (shared .feed-list container in the parent):
  // clicking anywhere on the row toggles; the Checkbox itself remains the
  // accessible keyboard control. Both paths set the same computed value, so
  // a click that hits the checkbox (and bubbles to the row) stays idempotent.
  return (
    <div
      className={
        'token-import-row' + (props.notSelectable ? ' not-selectable' : '')
      }
      onClick={() => triggerAction(props.tokenInfo.contract, !props.active)}
    >
      <Badge
        count={<Avatar src={blockchains[props.chain].logo} size={16} />}
        size="small"
        offset={[-2, 5]}
      >
        <Avatar src={props.tokenInfo.logo} size={30} />
      </Badge>
      <div className="token-import-main">
        <span className="token-import-symbol">{props.tokenInfo.symbol}</span>
        <span className="token-import-name" title={props.tokenInfo.name}>
          {props.tokenInfo.name}
        </span>
      </div>
      {props.deletePossible && (
        <Button
          type="text"
          danger
          size="small"
          icon={<Trash2Icon />}
          aria-label={t('home:tokens.delete_token')}
          title={t('home:tokens.delete_token')}
          onClick={(e) => {
            e.stopPropagation();
            void handleDelete(props.tokenInfo.contract);
          }}
        />
      )}
      <Checkbox
        checked={props.active}
        disabled={props.notSelectable}
        aria-label={props.tokenInfo.symbol}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          triggerAction(props.tokenInfo.contract, e.target.checked)
        }
      />
    </div>
  );
}

export default TokenBoxImport;
