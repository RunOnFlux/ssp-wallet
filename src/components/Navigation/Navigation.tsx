import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Space, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import Receive from '../Receive/Receive';
import PurchaseCrypto from '../Onramper/PurchaseCrypto';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';

import './Navigation.css';

function Navigation() {
  const { t } = useTranslation(['home']);
  const navigate = useNavigate();
  const [openReceive, setOpenReceive] = useState(false);
  const [openBuyCryptoDialog, setOpenBuyCryptoDialog] = useState(false);
  const receiveAction = (status: boolean) => {
    setOpenReceive(status);
  };
  const openBuyAction = (status: boolean) => {
    // ANTd fix: https://github.com/ant-design/ant-design/issues/43327
    if (status) {
      const elem = document.getElementById('root');
      if (elem) {
        elem.style.overflow = 'hidden';
      }
    } else {
      const elem = document.getElementById('root');
      if (elem) {
        elem.style.overflow = 'unset';
      }
    }
    setOpenBuyCryptoDialog(status);
  };
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const { servicesAvailability } = useAppSelector(
    (state) => state.servicesAvailability,
  );
  const blockchainConfig = blockchains[activeChain];
  return (
    <>
      <Space direction="horizontal" size="small" style={{ marginBottom: 15 }}>
        <Button
          type="default"
          icon={<ArrowUpOutlined />}
          size={'middle'}
          onClick={() =>
            navigate(
              blockchainConfig.chainType === 'evm' ? '/sendevm' : '/send',
              { state: { receiver: '' } },
            )
          }
        >
          <span>{t('home:navigation.send')}</span>
        </Button>
        {servicesAvailability.onramp && servicesAvailability.offramp && (
          <Tooltip
            title={
              !blockchainConfig.onramperNetwork &&
              !blockchainConfig.symbol.includes('TEST')
                ? t('home:buy_sell_crypto.coming_soon')
                : ''
            }
          >
            <Button
              type="default"
              size={'middle'}
              disabled={!blockchainConfig.onramperNetwork}
              className="linearGradientButton"
              onClick={() => {
                openBuyAction(true);
              }}
            >
              <span>
                {t('home:navigation.buy')} / {t('home:navigation.sell')}
              </span>
            </Button>
          </Tooltip>
        )}
        <Button
          type="default"
          icon={<ArrowDownOutlined />}
          size={'middle'}
          onClick={() => {
            receiveAction(true);
          }}
        >
          <span>{t('home:navigation.receive')}</span>
        </Button>
      </Space>
      <Receive open={openReceive} openAction={receiveAction} />
      <PurchaseCrypto
        open={openBuyCryptoDialog}
        openAction={openBuyAction}
        cryptoNetwork={blockchainConfig.onramperNetwork}
        cryptoAsset={blockchainConfig.symbol}
        wInUse={wallets[walletInUse].address}
      />
    </>
  );
}

export default Navigation;
