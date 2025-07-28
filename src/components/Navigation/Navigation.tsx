import { useState, useRef, useEffect } from 'react';
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
  const firstSpaceRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(true); // always use overflow design
  const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
  darkModePreference.addEventListener('change', (e) => changeTheme(e.matches));
  const [themeStyle, setThemeStyle] = useState(
    darkModePreference.matches ? 'light' : 'dark',
  );

  const changeTheme = (isDark: boolean) => {
    if (isDark) {
      setThemeStyle('light');
    } else {
      setThemeStyle('dark');
    }
  };

  useEffect(() => {
    const checkOverflow = () => {
      if (firstSpaceRef.current) {
        setIsOverflow(firstSpaceRef.current.scrollWidth > 0); // always use overflow design // 388
      }
    };

    checkOverflow();
  }, []);
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
  const isEVM = blockchainConfig.chainType === 'evm';

  return (
    <>
      <Space direction="horizontal" size="small" style={{ marginBottom: 10 }}>
        <Button
          type="default"
          icon={<ArrowUpOutlined />}
          size={'middle'}
          style={{ minWidth: '105px' }}
          onClick={() =>
            navigate(isEVM ? '/sendevm' : '/send', { state: { receiver: '' } })
          }
          data-tutorial="send-button"
        >
          <span>{t('home:navigation.send')}</span>
        </Button>
        <Space direction={isOverflow ? 'vertical' : 'horizontal'}>
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
                size={'small'}
                disabled={!blockchainConfig.onramperNetwork}
                className="linearGradientButton"
                onClick={() => {
                  openBuyAction(true);
                }}
                data-tutorial="buy-sell-button"
              >
                <span>
                  {t('home:navigation.buy')} / {t('home:navigation.sell')}
                </span>
              </Button>
            </Tooltip>
          )}
          {servicesAvailability.swap && (
            <Button
              type="default"
              className={
                themeStyle === 'light' ? 'buttonSwapLight' : 'buttonSwap'
              }
              size={'small'}
              variant="filled"
              color={themeStyle === 'light' ? 'yellow' : 'purple'}
              onClick={() => {
                navigate('/swap', { state: { buyAsset: activeChain } });
              }}
              data-tutorial="swap-button"
            >
              <span>{t('home:navigation.swap')}</span>
            </Button>
          )}
        </Space>
        <Button
          type="default"
          icon={<ArrowDownOutlined />}
          size={'middle'}
          style={{ minWidth: '105px' }}
          onClick={() => {
            receiveAction(true);
          }}
          data-tutorial="receive-button"
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
