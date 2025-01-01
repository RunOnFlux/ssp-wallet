import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAppSelector } from '../../hooks';
import TokensTable from './TokensTable';
import ImportToken from './ImportToken';


function Tokens() {
  const { t } = useTranslation(['home']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );

  const importToken = () => {
    console.log('import token');
    setOpenImportTokenDialog(true);
  };

  const openImportAction = (open: boolean) => {
    setOpenImportTokenDialog(open);
  };

  return (
    <div>
      <TokensTable />
      {openImportTokenDialog}
      <Space size={'large'} style={{ marginTop: 24}} direction='vertical'>
        <Button type="primary" size="middle" onClick={() => importToken()}>
          {t('home:tokens.import_token')}
        </Button>
      </Space>
      {openImportTokenDialog && (
        <ImportToken
          open={openImportTokenDialog}
          openAction={openImportAction}
          chain={activeChain}
          wInUse={walletInUse}
          contracts={wallets[walletInUse].activatedTokens ?? []}
        />
      )}
    </div>
  );
}

export default Tokens;
