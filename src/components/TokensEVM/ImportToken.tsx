import { Button, Modal, Flex, Space } from 'antd';
import { useState, useEffect } from 'react';
import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';
import TokenBoxImport from './TokenBoxImport';
import { setActivatedTokens } from '../../store';

function ImportToken(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  chain: keyof cryptos;
  wInUse: string;
  contracts: string[]; // contracts that are already imported
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const blockchainConfig = blockchains[props.chain];

  const [selectedContracts, setSelectedContracts] = useState(props.contracts);

  const handleOk = () => {
    openAction(false);
    // save to redux
    setActivatedTokens(props.chain, props.wInUse, selectedContracts || []);
    // save to storage
    void (async function () {
      await localForage.setItem(
        `activated-tokens-${props.chain}-${props.wInUse}`,
        selectedContracts,
      );
    })();
  };

  const handleCancel = () => {
    openAction(false);
    setSelectedContracts(props.contracts);
  };

  useEffect(() => {
    console.log(selectedContracts);
  }, [selectedContracts]);

  const contractChanged = (contract: string, value: boolean) => {
    if (value) {
      setSelectedContracts([...selectedContracts, contract]);
    } else {
      setSelectedContracts(
        selectedContracts.filter((item) => item !== contract),
      );
    }
  };

  return (
    <>
      <Modal
        title={t('home:tokens.import_token')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Flex
          wrap
          gap="middle"
          style={{ marginTop: '20px', marginBottom: '20px' }}
        >
          {blockchainConfig.tokens.map((item) => (
            <TokenBoxImport
              chain={props.chain}
              tokenInfo={item}
              key={item.contract + item.symbol}
              active={
                selectedContracts.includes(item.contract) || !item.contract
              }
              notSelectable={
                props.contracts.includes(item.contract) || !item.contract
              }
              selectAction={contractChanged}
            />
          ))}
        </Flex>
        <Space direction="vertical" size="large">
          <Button type="primary" size="large" onClick={handleOk}>
            {t('home:tokens.import_selected')}
          </Button>
          <Button type="link" block size="small" onClick={handleCancel}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default ImportToken;
