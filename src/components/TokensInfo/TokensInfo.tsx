import { Typography, Button, Space, Modal } from 'antd';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';

interface tokensInfoData {
  status: string;
  data?: string;
  tokens?: tokensInfo[];
}

interface tokensInfo {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface Props {
  open: boolean;
  chain: keyof cryptos;
  openAction?: (data: tokensInfoData | null) => void;
}

function TokensInfo({ open, chain, openAction }: Props) {
  const { t } = useTranslation(['home', 'common', 'cr']);

  const handleOk = () => {
    try {
      if (!chain) {
        if (openAction) {
          openAction({
            status: t('common:error'),
            data: t('home:tokensInfo.chain_not_specified'),
          });
        }
        return;
      }

      const chainInfo = blockchains[chain];
      if (!chainInfo) {
        if (openAction) {
          openAction({
            status: t('common:error'),
            data: t('home:tokensInfo.chain_not_supported'),
          });
        }
        return;
      }
      const tokensSupported = chainInfo.tokens;
      if (!tokensSupported) {
        if (openAction) {
          openAction({
            status: t('common:error'),
            data: t('home:tokensInfo.no_tokens_supported'),
          });
        }
        return;
      }
      const tokensInfo: tokensInfo[] = [];
      for (const token of tokensSupported) {
        const tokenInfo: tokensInfo = {
          contract: token.contract,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
        };
        if (blockchains[chain].chainId) {
          chainInfo.chainId = blockchains[chain].chainId;
        }
        tokensInfo.push(tokenInfo);
      }
      console.log(tokensInfo);
      if (openAction) {
        openAction({
          status: t('common:success'),
          tokens: tokensInfo,
        });
      }
    } catch (error) {
      console.log(error);
      if (openAction) {
        openAction({
          status: t('common:error'),
          data: t('home:tokensInfo.tokens_requests_info_error'),
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
        title={t('home:tokensInfo.tokens_requests')}
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
            <Text>
              {t('home:tokensInfo.tokens_requests_info', {
                chain: blockchains[chain]?.name,
              })}
            </Text>
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

export default TokensInfo;
