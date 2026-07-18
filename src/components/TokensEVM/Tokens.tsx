import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAppSelector } from '../../hooks';
import TokensTable from './TokensTable';
import ImportToken from './ImportToken';
import './TokenBox.css';

function Tokens() {
  const { t } = useTranslation(['home']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );

  const importToken = () => {
    setOpenImportTokenDialog(true);
  };

  const openImportAction = (open: boolean) => {
    setOpenImportTokenDialog(open);
  };

  return (
    <div>
      <TokensTable />
      <div className="tokens-actions">
        <Button
          type="primary"
          size="middle"
          onClick={() => importToken()}
          data-tutorial="add-token-button"
        >
          {t('home:tokens.import_token')}
        </Button>
      </div>
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
