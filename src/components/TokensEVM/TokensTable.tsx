import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { blockchains } from '@storage/blockchains';
import { useAppSelector } from '../../hooks';

function Tokens() {
  const { t } = useTranslation(['home']);
  const [fiatRate, setFiatRate] = useState(0);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);

  const importToken = () => {
    console.log('import token')
    setOpenImportTokenDialog(true);
  };

  return (
    <div>
      tiles with balances loop of TokenBox
    </div>
  );
}

export default Tokens;
