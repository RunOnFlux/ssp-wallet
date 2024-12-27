import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAppSelector } from '../../hooks';
import TokensTable from './TokensTable';
import ImportToken from './ImportToken';
import BuyCrypto from './BuyCrypto';
import SellCrypto from './SellCrypto';

function Tokens() {
  const { t } = useTranslation(['home']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);
  const [openBuyCryptoDialog, setOpenBuyCryptoDialog] = useState(false);
  const [openSellCryptoDialog, setOpenSellCryptoDialog] = useState(false);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );

  const importToken = () => {
    console.log('import token');
    setOpenImportTokenDialog(true);
  };

  const buyCrypto = () => {
    console.log('buy crypto');
    setOpenBuyCryptoDialog(true);
  };

  const sellCrypto = () => {
    console.log('sell crypto');
    setOpenSellCryptoDialog(true);
  };

  const openImportAction = (open: boolean) => {
    setOpenImportTokenDialog(open);
  };

  const openBuyAction = (open: boolean) => {
    setOpenBuyCryptoDialog(open);
  };

  const openSellAction = (open: boolean) => {
    setOpenSellCryptoDialog(open);
  };

  return (
    <div>
      <TokensTable />
      {openImportTokenDialog}
      <Space size={'large'} style={{ marginTop: 24}} direction='vertical'>
        <Button type="primary" size="middle" onClick={() => importToken()}>
          {t('home:tokens.import_token')}
        </Button>
        <Space size={'large'} style={{ marginBottom: 8 }} direction='horizontal'>
          <Button type="primary" size="middle" onClick={() => buyCrypto()}>
            {t('home:tokens.buy_crypto')}
          </Button>
          <Button type="primary" size="middle" onClick={() => sellCrypto()}>
            {t('home:tokens.sell_crypto')}
          </Button>
        </Space>
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
        <BuyCrypto
          open={openBuyCryptoDialog}
          openAction={openBuyAction}
          chain={activeChain}
          wInUse={wallets[walletInUse].address}
          contracts={wallets[walletInUse].activatedTokens ?? []}
        />
      )}
      {openSellCryptoDialog && (
        <SellCrypto
          open={openSellCryptoDialog}
          openAction={openSellAction}
          chain={activeChain}
          wInUse={wallets[walletInUse].address}
          contracts={wallets[walletInUse].activatedTokens ?? []}
        />
      )}
    </div>
  );
}

export default Tokens;
