import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Space } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import Receive from '../Receive/Receive';
import PurchaseCrypto from '../Onramper/PurchaseCrypto';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { blockchains } from '@storage/blockchains';

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
        <Space direction="vertical" size="small" className="navigation-button">
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
            <span className="navigation-button-text">
              {t('home:navigation.send')}
            </span>
          </Button>
        </Space>
        {blockchainConfig.onramperNetwork && servicesAvailability.onramp && (
          <Space
            direction="vertical"
            size="small"
            className="navigation-button"
          >
            <Button
              type="default"
              icon={<PlusOutlined />}
              size={'middle'}
              variant="filled"
              color="cyan"
              onClick={() => {
                openBuyAction(true);
              }}
            >
              <span className="navigation-button-text">
                {t('home:navigation.buy')}
              </span>
            </Button>
          </Space>
        )}

        <Space direction="vertical" size="small" className="navigation-button">
          <Button
            type="default"
            icon={<ArrowDownOutlined />}
            size={'middle'}
            onClick={() => {
              receiveAction(true);
            }}
          >
            <span className="navigation-button-text">
              {t('home:navigation.receive')}
            </span>
          </Button>
        </Space>
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
