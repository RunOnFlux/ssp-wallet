import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, CalculatorOutlined, SwapOutlined } from '@ant-design/icons';
import Receive from '../Receive/Receive';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';
import BuyAndSellCrypto from '../TokensEVM/BuyAndSellCrypto';
import SwapCrypto from '../TokensEVM/SwapCrypto';

function Navigation() {
  const { t } = useTranslation(['home']);
  const navigate = useNavigate();
  const [openReceive, setOpenReceive] = useState(false);
  const [openBuyAndSellCryptoDialog, setOpenBuyAndSellCryptoDialog] = useState(false);
  const [openSwapCryptoDialog, setOpenSwapCryptoDialog] = useState(false);
  const receiveAction = (status: boolean) => {
    setOpenReceive(status);
  };
  const { activeChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[activeChain];
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );

  const buyAndSellCrypto = () => {
    console.log('buy crypto');
    setOpenBuyAndSellCryptoDialog(true);
  };

  const swapCrypto = () => {
    console.log('sell crypto');
    setOpenSwapCryptoDialog(true);
  };

  const openBuyAndSellAction = (open: boolean) => {
    setOpenBuyAndSellCryptoDialog(open);
  };

  const openSwapAction = (open: boolean) => {
    setOpenSwapCryptoDialog(open);
  };

  return (
    <>
      <Space direction="vertical" size="middle" style={{ marginBottom: 15 }}>
        <Space direction="horizontal" size="large">
          <Space direction="vertical" size="small">
            <Button type="default" icon={<CalculatorOutlined />} shape="circle" size="large" onClick={() => buyAndSellCrypto()} />
            {t('home:tokens.buysell_crypto')}
          </Space>
          <Space direction="vertical" size="small">
            <Button type="default" icon={<SwapOutlined />} shape="circle" size="large" onClick={() => swapCrypto()} />
            {t('home:tokens.swap_crypto')}
          </Space>
          <Space direction="vertical" size="small">
            <Button
              type="default"
              shape="circle"
              icon={<ArrowUpOutlined />}
              size={'large'}
              onClick={() =>
                navigate(
                  blockchainConfig.chainType === 'evm' ? '/sendevm' : '/send',
                  { state: { receiver: '' } },
                )
              }
            />
            {t('home:navigation.send')}
          </Space>
          <Space direction="vertical" size="small">
            <Button
              type="default"
              shape="circle"
              icon={<ArrowDownOutlined />}
              size={'large'}
              onClick={() => {
                receiveAction(true);
              }}
            />
            {t('home:navigation.receive')}
          </Space>
        </Space>
        <Receive open={openReceive} openAction={receiveAction} />
      </Space>
      {openBuyAndSellCryptoDialog && (
        <BuyAndSellCrypto
          open={openBuyAndSellCryptoDialog}
          openAction={openBuyAndSellAction}
          chain={activeChain}
          wInUse={wallets[walletInUse].address}
          contracts={wallets[walletInUse].activatedTokens ?? []}
        />
      )}
      {openSwapCryptoDialog && (
        <SwapCrypto
          open={openSwapCryptoDialog}
          openAction={openSwapAction}
          chain={activeChain}
          wInUse={wallets[walletInUse].address}
          contracts={wallets[walletInUse].activatedTokens ?? []}
        />
      )}
    </>
  );
}

export default Navigation;
