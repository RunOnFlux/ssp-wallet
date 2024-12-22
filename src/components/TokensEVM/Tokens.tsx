import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAppSelector } from '../../hooks';
import TokensTable from './TokensTable';
import ImportToken from './ImportToken';
import PurchaseCrypto from './PurchaseCrypto';

function Tokens() {
  const { t } = useTranslation(['home']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);
  const [openBuyCryptoDialog, setOpenBuyCryptoDialog] = useState(false);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );

  const importToken = () => {
    console.log('import token');
    setOpenImportTokenDialog(true);
  };

  const purchaseCrypto = () => {
    console.log('buy crypto');
    setOpenBuyCryptoDialog(true);
  };

  const openImportAction = (open: boolean) => {
    setOpenImportTokenDialog(open);
  };

  const openBuyAction = (open: boolean) => {
    setOpenBuyCryptoDialog(open);
  };

  return (
    <div>
      <TokensTable />
      {openImportTokenDialog}
      <Space size={'large'} style={{ marginTop: 16, marginBottom: 8 }} direction='vertical'>
        <Button type="primary" size="middle" onClick={() => importToken()}>
          {t('home:tokens.import_token')}
        </Button>
        <Button type="primary" size="middle" onClick={() => purchaseCrypto()}>
          {t('home:tokens.purchase_crypto')}
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
       {openBuyCryptoDialog && (
        <PurchaseCrypto
          open={openBuyCryptoDialog}
          openAction={openBuyAction}
          chain={activeChain}
          wInUse={wallets[walletInUse].address}
          contracts={wallets[walletInUse].activatedTokens ?? []}
        />
      )}
    </div>
  );
}

export default Tokens;
