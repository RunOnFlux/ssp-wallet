import { Button, Modal, Flex, Space, Input, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { useState } from 'react';
import { blockchains, Token } from '@storage/blockchains';
import localForage from 'localforage';
import { cryptos } from '../../types';
import { useTranslation } from 'react-i18next';
import { setActivatedTokens, setImportedTokens } from '../../store';
import { getTokenMetadata } from '../../lib/tokens';

function ImportCustomToken(props: {
  open: boolean;
  openAction: (status: 'success' | false) => void;
  chain: keyof cryptos;
  wInUse: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { open, openAction } = props;
  const [messageApi, contextHolder] = message.useMessage();

  const [contractAddress, setContractAddress] = useState('');

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  // add custom token
  // check if already imported, if not get metadata and add to custom tokens, store in custom tokens
  // add to current wallet activated tokens
  const handleCustomImport = async () => {
    // check if already in our tokens array
    const nativelyPresent = blockchains[props.chain].tokens.find(
      (item) => item.contract.toLowerCase() === contractAddress.toLowerCase(),
    );

    if (nativelyPresent) {
      displayMessage('error', t('home:tokens.token_already_imported'));
      return;
    }

    // get our imported tokens from localforage
    const importedTokens: Token[] =
      (await localForage.getItem(`imported-tokens-${props.chain}`)) ?? [];

    // check if already imported
    const alreadyImported = importedTokens.find(
      (item) => item.contract.toLowerCase() === contractAddress.toLowerCase(),
    );
    if (alreadyImported) {
      displayMessage('error', t('home:tokens.token_already_imported'));
      return;
    }

    const data = await getTokenMetadata(contractAddress, props.chain).catch(
      () => {
        displayMessage('error', t('home:tokens.unable_to_fetch_metadata'));
        return;
      },
    );
    if (!data) {
      return;
    }

    let logo = 'src/assets/customToken.svg';

    if (!data.name || !data.symbol) {
      displayMessage('error', t('home:tokens.invalid_token_contract'));
      return;
    }

    if (data.logo) {
      logo = data.logo;
    }

    const tokenToImport = {
      contract: contractAddress,
      name: data.name,
      symbol: data.symbol,
      decimals: data.decimals,
      logo: logo,
    };

    // add to our imported-tokens array
    importedTokens.push(tokenToImport);
    setImportedTokens(props.chain, importedTokens || []);
    // save it to localforage
    void (async function () {
      await localForage.setItem(
        `imported-tokens-${props.chain}`,
        importedTokens,
      );
    })();

    // add to our activated-tokens array
    const activatedTokens: string[] =
      (await localForage.getItem(
        `activated-tokens-${props.chain}-${props.wInUse}`,
      )) ?? [];
    activatedTokens.push(tokenToImport.contract);
    setActivatedTokens(props.chain, props.wInUse, activatedTokens || []);
    void (async function () {
      await localForage.setItem(
        `activated-tokens-${props.chain}-${props.wInUse}`,
        activatedTokens,
      );
    })();

    // notify imported
    displayMessage('success', t('home:tokens.token_imported'));

    openAction('success');
  };

  const handleCancelToken = () => {
    openAction(false);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('common:add_custom_token')}
        open={open}
        onOk={handleCustomImport}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancelToken}
        footer={[]}
      >
        <Flex
          wrap
          gap="middle"
          style={{ marginTop: '20px', marginBottom: '0px' }}
        >
          <Input
            id="contractAddress"
            variant="outlined"
            placeholder={t('home:tokens.enter_contract_address')}
            allowClear
            onChange={(e) => setContractAddress(e.target.value)}
            size="large"
          />
        </Flex>
        <Space direction="vertical" size="large">
          <div></div>
          <Button type="primary" size="large" onClick={handleCustomImport}>
            {t('home:tokens.add_to_list')}
          </Button>
          <Button type="link" block size="small" onClick={handleCancelToken}>
            {t('common:back')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default ImportCustomToken;
