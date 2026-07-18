import { blockchains, Token } from '@storage/blockchains';
import localForage from 'localforage';
import { Coins as CoinsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import TokenBox from './TokenBox';
import EmptyState from '../EmptyState/EmptyState';
import { setActivatedTokens } from '../../store';
import { useEffect, useState } from 'react';

function TokensTable() {
  const { t } = useTranslation(['home']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse, importedTokens } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const activatedTokens = wallets[walletInUse].activatedTokens ?? [];

  const [activeTokensInfo, setActiveTokensInfo] = useState<Token[]>([]);

  useEffect(() => {
    const updatedActiveTokensInfo = blockchainConfig.tokens
      .concat(importedTokens ?? [])
      .filter(
        (item) => activatedTokens.includes(item.contract) || !item.contract, // main token is always activated
      );

    setActiveTokensInfo(updatedActiveTokensInfo);
  }, [importedTokens, activatedTokens]);

  const handleRemoveToken = (contract: string) => {
    // save to redux
    const selectedContracts = activatedTokens.filter(
      (item) => item !== contract,
    );
    setActivatedTokens(activeChain, walletInUse, selectedContracts || []);
    // save to storage
    void (async function () {
      await localForage.setItem(
        `activated-tokens-${activeChain}-${walletInUse}`,
        selectedContracts,
      );
    })();
  };

  return activeTokensInfo.length === 0 ? (
    <EmptyState icon={<CoinsIcon />} description={t('home:tokens.no_tokens')} />
  ) : (
    <div className="feed-list">
      {activeTokensInfo.map((item, index) => (
        <TokenBox
          chain={activeChain}
          tokenInfo={item}
          key={item.contract + item.symbol + index}
          handleRemoveToken={handleRemoveToken}
        />
      ))}
    </div>
  );
}

export default TokensTable;
