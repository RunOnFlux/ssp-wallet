import { Card, Avatar, Flex, Button, Popconfirm, Badge } from 'antd';
import BigNumber from 'bignumber.js';
import { useTranslation } from 'react-i18next';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { MouseEvent, useEffect, useState } from 'react';
import { Token, blockchains } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { useAppSelector } from '../../hooks';
import { tokenBalanceEVM, cryptos } from '../../types';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';

import './TokenBox.css';

const { Meta } = Card;

function TokenBox(props: {
  chain: keyof cryptos;
  tokenInfo: Token;
  handleRemoveToken: (contract: string) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [fiatRate, setFiatRate] = useState(0);
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
  const balanceUsd = new BigNumber(balance)
    .dividedBy(10 ** props.tokenInfo.decimals)
    .multipliedBy(new BigNumber(fiatRate));

  const openDetails = (
    event: MouseEvent<HTMLDivElement, globalThis.MouseEvent>,
  ) => {
    const containingElement = document.querySelector(
      '#token-id' + props.tokenInfo.contract,
    );
    if (containingElement) {
      console.log('kappa');
      if (containingElement.contains(event.target as Node)) {
        // do not register clicks here
        return;
      }
    }
    setInfoExpanded(!infoExpanded);
  };

  useEffect(() => {
    getCryptoRate(
      props.tokenInfo.symbol.toLowerCase() as keyof typeof cryptoRates, // we use lower cased symbol as key
      sspConfig().fiatCurrency,
    );
  }, []); // Run once on mount - token never changes within component instance

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    const cr = cryptoRates[crypto] ?? 0;
    const fi = fiatRates[fiat] ?? 0;
    setFiatRate(cr * fi);
  };

  const removeToken = () => {
    props.handleRemoveToken(props.tokenInfo.contract);
  };

  return (
    <div>
      <Card
        onClick={(e) => openDetails(e)}
        hoverable
        style={{ marginTop: 10 }}
        size="small"
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
                {formatCrypto(
                  new BigNumber(balance).dividedBy(
                    10 ** props.tokenInfo.decimals,
                  ),
                  props.tokenInfo.decimals,
                ) +
                  ' ' +
                  props.tokenInfo.symbol}
              </div>
            </>
          }
          description={
            <>
              <Flex vertical>
                <div>
                  <div style={{ float: 'left' }}>{props.tokenInfo.name}</div>
                  <div style={{ float: 'right' }}>
                    {formatFiatWithSymbol(balanceUsd)}
                  </div>
                </div>
                {infoExpanded && (
                  <div
                    className={'token-box'}
                    id={'token-id' + props.tokenInfo.contract}
                  >
                    {props.tokenInfo.contract && (
                      <p style={{ margin: 0, wordBreak: 'break-all' }}>
                        {t('common:contract')}: {props.tokenInfo.contract}
                      </p>
                    )}
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('common:decimals')}: {props.tokenInfo.decimals}
                    </p>
                    <p style={{ margin: 0, wordBreak: 'break-all' }}>
                      {t('common:network')}: {blockchains[props.chain].name}
                    </p>
                    {props.tokenInfo.contract && (
                      <div className={'remove-button'}>
                        <Popconfirm
                          title={t('home:tokens.remove_token')}
                          description={
                            <>{t('home:tokens.remove_token_info')}</>
                          }
                          overlayStyle={{ maxWidth: 360, margin: 10 }}
                          okText={t('home:tokens.remove_token')}
                          cancelText={t('common:cancel')}
                          onConfirm={() => {
                            void removeToken();
                          }}
                          icon={
                            <QuestionCircleOutlined
                              style={{ color: 'orange' }}
                            />
                          }
                        >
                          <Button type="default" danger size="small">
                            {t('home:tokens.remove_token')}
                          </Button>
                        </Popconfirm>
                      </div>
                    )}
                  </div>
                )}
              </Flex>
            </>
          }
        />
      </Card>
    </div>
  );
}

export default TokenBox;
