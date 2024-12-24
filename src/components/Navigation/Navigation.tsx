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
  const blockchainConfig = blockchains[activeChain];
  return (
    <>
      <Space direction="horizontal" size="small" style={{ marginBottom: 15 }}>
        <Button
          type="dashed"
          shape="round"
          icon={<ArrowUpOutlined />}
          size={'large'}
          onClick={() =>
            navigate(
              blockchainConfig.chainType === 'evm' ? '/sendevm' : '/send',
              { state: { receiver: '' } },
            )
          }
        >
          {t('home:navigation.send')}
        </Button>
        {blockchainConfig.onramperNetwork && (
          <Button
            type="dashed"
            shape="round"
            icon={<PlusOutlined />}
            size={'large'}
            onClick={() => {
              openBuyAction(true);
            }}
          >
            {t('home:navigation.buy')}
          </Button>
        )}

        <Button
          type="dashed"
          shape="round"
          icon={<ArrowDownOutlined />}
          size={'large'}
          onClick={() => {
            receiveAction(true);
          }}
        >
          {t('home:navigation.receive')}
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
