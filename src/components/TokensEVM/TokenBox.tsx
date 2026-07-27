import { Button, Popconfirm, Typography } from 'antd';
import BigNumber from 'bignumber.js';
import { useTranslation } from 'react-i18next';
import { CircleHelp as CircleHelpIcon } from 'lucide-react';
import { useState } from 'react';
import { Token, blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { useAppSelector } from '../../hooks';
import { tokenBalanceEVM, cryptos } from '../../types';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';
import { truncateAddress } from '../../lib/addressDisplay';

import './TokenBox.css';

const { Text } = Typography;

/**
 * One activated token — v2 feed row: token logo with chain-badge overlap,
 * symbol/name left, balance + fiat right-aligned in tabular-nums. Expands
 * into the shared inset detail card (contract, decimals, network, remove).
 */
function TokenBox(props: {
  chain: keyof cryptos;
  tokenInfo: Token;
  handleRemoveToken: (contract: string) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[props.chain],
  );
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const balanceToken: tokenBalanceEVM | undefined = wallets[
    walletInUse
  ].tokenBalances?.find((bal) => bal.contract === props.tokenInfo.contract);
  const balanceTOKEN: string = balanceToken ? balanceToken.balance : '0';
  const balanceCOIN = wallets[walletInUse].balance;
  let balance = balanceTOKEN;
  if (!props.tokenInfo.contract) {
    balance = balanceCOIN;
  }
  // Derived during render, NOT held in state behind a mount-only effect.
  // Previously this was state set by a `[]`-deps effect, so the rate froze at
  // whatever cryptoRates/fiatRates held on mount — and pinned to $0.00 for the
  // whole session when rates had not arrived yet. The component already
  // subscribes to state.fiatCryptoRates, so it re-renders on every rates
  // update; computing here is both correct and less code. (Balances.tsx does
  // the same sum with [activeChain, cryptoRates, fiatRates] deps.)
  const fiatRate =
    (cryptoRates[
      props.tokenInfo.symbol.toLowerCase() as keyof typeof cryptoRates
    ] ?? 0) * (fiatRates[sspConfig().fiatCurrency] ?? 0);

  const balanceUsd = new BigNumber(balance)
    .dividedBy(10 ** props.tokenInfo.decimals)
    .multipliedBy(new BigNumber(fiatRate));

  const removeToken = () => {
    props.handleRemoveToken(props.tokenInfo.contract);
  };

  return (
    <div>
      <button
        type="button"
        className="token-row"
        onClick={() => setInfoExpanded(!infoExpanded)}
        aria-expanded={infoExpanded}
      >
        <span className="token-row-logo" aria-hidden="true">
          <img
            className="token-row-logo-main"
            src={props.tokenInfo.logo}
            alt=""
          />
          {/* Chain badge only for real tokens: a native asset IS the chain, so
              badging it stuck a second, smaller copy of the same glyph on the
              row — and next to an ERC-20 row the badge stopped reading as
              "this token lives on <chain>". */}
          {props.tokenInfo.contract && (
            <img
              className="token-row-logo-badge"
              src={blockchains[props.chain].logo}
              alt=""
            />
          )}
        </span>
        <span className="token-row-main">
          <span className="token-row-symbol">{props.tokenInfo.symbol}</span>
          <span className="token-row-name">{props.tokenInfo.name}</span>
        </span>
        <span className="token-row-end">
          <span className="token-row-balance privacy-sensitive">
            {formatCrypto(
              new BigNumber(balance).dividedBy(10 ** props.tokenInfo.decimals),
              props.tokenInfo.decimals,
            ) +
              ' ' +
              props.tokenInfo.symbol}
          </span>
          <span className="token-row-fiat privacy-sensitive">
            {formatFiatWithSymbol(balanceUsd)}
          </span>
        </span>
      </button>
      {infoExpanded && (
        <div className="feed-details token-row-details">
          {props.tokenInfo.contract && (
            <div className="feed-detail-line">
              <span className="feed-detail-label">{t('common:contract')}</span>
              <Text
                copyable={{ text: props.tokenInfo.contract }}
                className="feed-detail-mono"
              >
                {truncateAddress(props.tokenInfo.contract, 10)}
              </Text>
            </div>
          )}
          <div>
            <span className="feed-detail-label">{t('common:decimals')}</span>{' '}
            {props.tokenInfo.decimals}
          </div>
          <div>
            <span className="feed-detail-label">{t('common:network')}</span>{' '}
            {blockchains[props.chain].name}
          </div>
          {props.tokenInfo.contract && (
            <div className="feed-detail-actions">
              <Popconfirm
                title={t('home:tokens.remove_token')}
                description={<>{t('home:tokens.remove_token_info')}</>}
                overlayStyle={{ maxWidth: 360, margin: 10 }}
                okText={t('home:tokens.remove_token')}
                cancelText={t('common:cancel')}
                onConfirm={() => {
                  void removeToken();
                }}
                icon={<CircleHelpIcon style={{ color: '#f59e0b' }} />}
              >
                <Button type="default" danger size="small">
                  {t('home:tokens.remove_token')}
                </Button>
              </Popconfirm>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TokenBox;
