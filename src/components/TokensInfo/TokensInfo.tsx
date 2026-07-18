import { Button, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';
import '../DappRequest/DappRequest.css';

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
            status: 'ERROR', // do not translate
            data: t('home:tokensInfo.chain_not_specified'),
          });
        }
        return;
      }

      const chainInfo = blockchains[chain];
      if (!chainInfo) {
        if (openAction) {
          openAction({
            status: 'ERROR', // do not translate
            data: t('home:tokensInfo.chain_not_supported'),
          });
        }
        return;
      }
      const tokensSupported = chainInfo.tokens;
      if (!tokensSupported) {
        if (openAction) {
          openAction({
            status: 'ERROR', // do not translate
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
          status: 'SUCCESS', // do not translate
          tokens: tokensInfo,
        });
      }
    } catch (error) {
      console.log(error);
      if (openAction) {
        openAction({
          status: 'ERROR', // do not translate
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
            {t('home:tokensInfo.tokens_requests_info', {
              chain: blockchains[chain]?.name,
            })}
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

export default TokensInfo;
