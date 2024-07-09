import { Card, Avatar } from 'antd';
import BigNumber from 'bignumber.js';
import { useEffect, useRef, useState } from 'react';
import { Token } from '@storage/blockchains';
import { sspConfig } from '@storage/ssp';
import { useAppSelector } from '../../hooks';
import { tokenBalanceEVM, cryptos } from '../../types';
import { formatFiatWithSymbol, formatCrypto } from '../../lib/currency';

const { Meta } = Card;

function TokenBox(props: { chain: keyof cryptos; tokenInfo: Token }) {
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const [fiatRate, setFiatRate] = useState(0);
  const [openDetailsDialog, setOpenDetailsDialog] = useState(false);
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

  const openDetails = () => {
    setOpenDetailsDialog(true);
    console.log('open details');
    console.log(openDetailsDialog);
  };

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    getCryptoRate(
      props.tokenInfo.symbol.toLowerCase() as keyof typeof cryptoRates, // we use lower cased symbol as key
      sspConfig().fiatCurrency,
    );
  });

  const getCryptoRate = (
    crypto: keyof typeof cryptoRates,
    fiat: keyof typeof fiatRates,
  ) => {
    const cr = cryptoRates[crypto] ?? 0;
    const fi = fiatRates[fiat] ?? 0;
    setFiatRate(cr * fi);
  };

  return (
    <div>
      <Card
        hoverable
        style={{ marginTop: 10 }}
        size="small"
        onClick={openDetails}
      >
        <Meta
          avatar={<Avatar src={props.tokenInfo.logo} size={30} />}
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
              <div style={{ float: 'left' }}>{props.tokenInfo.name}</div>
              <div style={{ float: 'right' }}>
                {formatFiatWithSymbol(balanceUsd)}
              </div>
            </>
          }
        />
      </Card>
    </div>
  );
}

export default TokenBox;
