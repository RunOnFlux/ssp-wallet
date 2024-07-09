import { Button, Modal, Flex } from 'antd';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';
import TokenBoxImport from './TokenBoxImport';

function TxRejected(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  chain: keyof cryptos;
  contracts: string[]; // contracts that are already imported
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const blockchainConfig = blockchains[props.chain];

  const handleOk = () => {
    openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:tokens.import_token')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[]}
      >
        <Flex wrap gap="middle" style={{ marginTop: '20px', marginBottom: '20px' }}>
          {blockchainConfig.tokens.map((item) => (
            <TokenBoxImport
              chain={props.chain}
              tokenInfo={item}
              key={item.contract + item.symbol}
              active={props.contracts.includes(item.contract) || !item.contract}
            />
          ))}
        </Flex>
        <Button type="primary" size="middle" onClick={handleOk}>
          {t('home:tokens.import')}
        </Button>
      </Modal>
    </>
  );
}

export default TxRejected;
