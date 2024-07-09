import { blockchains } from '@storage/blockchains';
import { useAppSelector } from '../../hooks';
import TokenBox from './TokenBox';

function TokensTable() {
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const activatedTokens = wallets[walletInUse].activatedTokens ?? [];
  console.log(activatedTokens);

  // filter blockchainConfig.tokens with activatedTokens contracts
  const activeTokensInfo = blockchainConfig.tokens.filter((item) =>
    activatedTokens.includes(item.contract) || !item.contract, // main token is always activated
  );

  return (
    <div>
      {activeTokensInfo.map((item) => (
        <TokenBox
          chain={activeChain}
          tokenInfo={item}
          key={item.contract + item.symbol}
        />
      ))}
    </div>
  );
}

export default TokensTable;
