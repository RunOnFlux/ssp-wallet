import { Button, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import '../DappRequest/DappRequest.css';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import { generatedWallets } from '../../types';

interface chainsInfoData {
  status: string;
  data?: string;
  chains?: chainsInfo[];
}

interface chainsInfo {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  chainId?: string;
}

interface Props {
  open: boolean;
  userOnly: boolean;
  openAction?: (data: chainsInfoData | null) => void;
}

function ChainsInfo({ open, userOnly, openAction }: Props) {
  const { t } = useTranslation(['home', 'common', 'cr']);

  const handleOk = async () => {
    try {
      const allBlockchainsInfo: chainsInfo[] = [];
      for (const chain in blockchains) {
        const chainInfo: chainsInfo = {
          id: chain,
          name: blockchains[chain].name,
          symbol: blockchains[chain].symbol,
          decimals: blockchains[chain].decimals,
        };
        if (blockchains[chain].chainId) {
          chainInfo.chainId = blockchains[chain].chainId;
        }
        allBlockchainsInfo.push(chainInfo);
      }
      const userChainsInfo: chainsInfo[] = [];
      if (userOnly) {
        for (const chain of allBlockchainsInfo) {
          const generatedWallets: generatedWallets =
            (await localForage.getItem(`wallets-${chain.id}`)) ?? {};
          if (Object.keys(generatedWallets).length > 0) {
            userChainsInfo.push(chain);
          }
        }
      }
      console.log(allBlockchainsInfo);
      if (openAction) {
        openAction({
          status: 'SUCCESS', // do not translate
          chains: userOnly ? userChainsInfo : allBlockchainsInfo,
        });
      }
    } catch (error) {
      console.log(error);
      if (openAction) {
        openAction({
          status: 'ERROR', // do not translate
          data: t('home:chainsInfo.chain_requests_info_error'),
        });
      }
    }
  };

  const handleCancel = () => {
    if (openAction) {
      openAction(null);
    }
  };

  return (
    <>
      <Modal
        title={t('home:chainsInfo.chain_requests')}
        open={open}
        onCancel={handleCancel}
        footer={[]}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginTop: 16,
          }}
        >
          <p className="dapp-ask">
            {userOnly
              ? t('home:chainsInfo.chain_requests_info_user')
              : t('home:chainsInfo.chain_requests_info')}
          </p>
          <div className="dapp-actions">
            <Button type="primary" size="large" block onClick={handleOk}>
              {t('common:approve_request')}
            </Button>
            <Button type="text" block onClick={handleCancel}>
              {t('common:reject_request')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default ChainsInfo;
