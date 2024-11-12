import { blockchains } from '@storage/blockchains';
import localForage from 'localforage';
import { useAppSelector } from '../../hooks';
import TokenBox from './TokenBox';
import { setActivatedTokens } from '../../store';

function TokensTable() {
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse, importedTokens } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const activatedTokens = wallets[walletInUse].activatedTokens ?? [];
  console.log(activatedTokens);

  // filter blockchainConfig.tokens with activatedTokens contracts
  const activeTokensInfo = blockchainConfig.tokens
    .concat(importedTokens ?? [])
    .filter(
      (item) => activatedTokens.includes(item.contract) || !item.contract, // main token is always activated
    );

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

  return (
    <div>
      {activeTokensInfo.map((item) => (
        <TokenBox
          chain={activeChain}
          tokenInfo={item}
          key={item.contract + item.symbol}
          handleRemoveToken={handleRemoveToken}
        />
      ))}
    </div>
  );
}

export default TokensTable;
