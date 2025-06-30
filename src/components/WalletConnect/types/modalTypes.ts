import { WalletKitTypes } from '@reown/walletkit';

// Use WalletKitTypes for proper typing
export type SessionProposal = WalletKitTypes.SessionProposal;
export type SessionRequest = WalletKitTypes.SessionRequest;

export interface BaseModalProps {
  request?: SessionRequest | null;
  proposal?: SessionProposal | null;
  onApprove: (
    requestOrProposal: SessionRequest | SessionProposal,
  ) => Promise<void>;
  onReject: (
    requestOrProposal: SessionRequest | SessionProposal,
  ) => Promise<void>;
}

export interface EthereumTransaction {
  to?: string;
  from?: string;
  value?: string;
  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
  data?: string;
  nonce?: string;
}

export interface SwitchChainRequest {
  chainId: string;
}

export interface ChainConfig {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}
