import { Button, Modal, Flex, Space, Input, Divider, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { useState, useEffect } from 'react';
import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';
import TokenBoxImport from './TokenBoxImport';
import { setActivatedTokens } from '../../store';
import ImportCustomToken from './ImportCustomToken';
import { useAppSelector } from '../../hooks';

function ImportToken(props: {
  open: boolean;
  openAction: (status: boolean) => void;
  chain: keyof cryptos;
  wInUse: string;
  contracts: string[]; // contracts that are already imported
}) {
  const { t } = useTranslation(['home', 'common']);
  const [messageApi, contextHolder] = message.useMessage();
  const { open, openAction } = props;
  const blockchainConfig = blockchains[props.chain];

  const [selectedContracts, setSelectedContracts] = useState(props.contracts);
  const [search, setSearch] = useState('');
  const { importedTokens } = useAppSelector((state) => state[props.chain]);
  const [filteredTokens, setFilteredTokens] = useState(blockchainConfig.tokens);
  const [filteredCustomTokens, setFilteredCustomTokens] = useState(
    importedTokens ?? [],
  );
  const [currentlyImportedTokens, setCurrentlyImportedTokens] = useState(
    importedTokens ?? [],
  );
  const [openCustomImportTokenDialog, setOpenCustomImportTokenDialog] =
    useState(false);

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

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

  useEffect(() => {
    setFilteredTokens(
      blockchainConfig.tokens.filter(
        (token) =>
          token.symbol.toLowerCase().startsWith(search.toLowerCase()) ||
          token.contract.toLowerCase().startsWith(search.toLowerCase()) ||
          token.name.toLowerCase().startsWith(search.toLowerCase()),
      ),
    );
    setFilteredCustomTokens(
      (importedTokens ?? []).filter(
        (token) =>
          token.symbol.toLowerCase().startsWith(search.toLowerCase()) ||
          token.contract.toLowerCase().startsWith(search.toLowerCase()) ||
          token.name.toLowerCase().startsWith(search.toLowerCase()),
      ),
    );
    if (
      importedTokens &&
      importedTokens.length < currentlyImportedTokens.length
    ) {
      console.log(
        'importedTokens is now smaller array than before, some token was deleted, show message',
      );
      displayMessage('success', t('home:tokens.token_deleted'));
    }
    setCurrentlyImportedTokens(importedTokens ?? []);
  }, [search, importedTokens]);

  const contractChanged = (contract: string, value: boolean) => {
    if (value) {
      setSelectedContracts([...selectedContracts, contract]);
    } else {
      setSelectedContracts(
        selectedContracts.filter((item) => item !== contract),
      );
    }
  };

  const handleCustomImportTokenDialogAction = (status: 'success' | boolean) => {
    setOpenCustomImportTokenDialog(false);
    if (status === 'success') {
      // also close this dialog
      openAction(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:tokens.import_token')}
        open={open && !openCustomImportTokenDialog}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Flex
          wrap
          gap="middle"
          style={{ marginTop: '20px', marginBottom: '40px' }}
        >
          <Input
            id="searchToken"
            variant="outlined"
            placeholder={t('home:tokens.search_token')}
            allowClear
            onChange={(e) => setSearch(e.target.value)}
            size="large"
          />
          {filteredTokens.map((item) => (
            <TokenBoxImport
              chain={props.chain}
              walletInUse={props.wInUse}
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
          {filteredCustomTokens.length > 0 && (
            <>
              <Divider />
              {filteredCustomTokens.map((item) => (
                <TokenBoxImport
                  chain={props.chain}
                  walletInUse={props.wInUse}
                  tokenInfo={item}
                  key={item.contract + item.symbol}
                  active={
                    selectedContracts.includes(item.contract) || !item.contract
                  }
                  notSelectable={
                    props.contracts.includes(item.contract) || !item.contract
                  }
                  selectAction={contractChanged}
                  deletePossible
                />
              ))}
            </>
          )}
        </Flex>
        <Space direction="vertical" size="large">
          <Button type="primary" size="large" onClick={handleOk}>
            {t('home:tokens.import_selected')}
          </Button>
          <Button
            type="link"
            block
            size="small"
            onClick={() => setOpenCustomImportTokenDialog(true)}
          >
            {t('common:add_custom_token')}
          </Button>
          <Button type="link" block size="small" onClick={handleCancel}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
      {openCustomImportTokenDialog && (
        <ImportCustomToken
          open={openCustomImportTokenDialog}
          openAction={handleCustomImportTokenDialogAction}
          chain={props.chain}
          wInUse={props.wInUse}
        />
      )}
    </>
  );
}

export default ImportToken;
