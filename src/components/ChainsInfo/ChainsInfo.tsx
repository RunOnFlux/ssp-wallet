import { Typography, Button, Space, Modal } from 'antd';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';
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
          status: t('common:success'),
          chains: userOnly ? userChainsInfo : allBlockchainsInfo,
        });
      }
    } catch (error) {
      console.log(error);
      if (openAction) {
        openAction({
          status: t('common:error'),
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
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Space direction="vertical" size="small">
            {userOnly ? (
              <Text>{t('home:chainsInfo.chain_requests_info_user')}</Text>
            ) : (
              <Text>{t('home:chainsInfo.chain_requests_info')}</Text>
            )}
          </Space>
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button type="primary" size="large" onClick={handleOk}>
              {t('common:approve_request')}
            </Button>
            <Button type="link" block size="small" onClick={handleCancel}>
              {t('common:reject_request')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default ChainsInfo;
