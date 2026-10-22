/**
 * The relay action payloads SSP Wallet sends to SSP Key for enterprise vault
 * requests (`enterprisevaultsign` for transactions and EVM message signing,
 * `enterprisefluxnodestart` for Flux node starts).
 *
 * Pure builders, so the exact field names and types SSP Key parses are pinned
 * by a cross-repo contract test (tests/lib/vaultRelayPayload.spec.ts here and
 * tests/lib/vaultRelayPayloadContract.test.ts in SSP Key, both against
 * fixtures/vd-relay-payloads.json).
 *
 * VD-2: `vaultDescriptor` travels as the JSON OBJECT SSP Enterprise sent (it is
 * nested inside the JSON-string payload, never double-encoded) and
 * `vaultDescriptorHash` as its 64-hex string, both verbatim. SSP Key verifies
 * and pins them on its own and refuses any request without them
 * ("Update required: vault descriptor missing").
 */

export interface RelayNonce {
  kPublic: string;
  kTwoPublic: string;
}

export interface VaultSignRelayPayloadInput {
  chain: string;
  /** chainType of the vault chain ('evm', 'sol', or undefined for UTXO). */
  chainType?: string;
  orgIndex: number;
  vaultIndex: number;
  vaultName: string;
  orgName: string;
  recipients: unknown[];
  fee: string;
  memo: string;
  rawUnsignedTx: string;
  inputDetails: unknown[];
  walletSignatures: string[];
  walletPubKey: string;
  requestId: string;
  wkIdentity: string;
  /** Numeric script type (getScriptType of the chain's script type). */
  scriptType: number;
  proposalRefs?: { orgId: string; vaultId: string; proposalId: string };
  signingMode?: string;
  reservedKeyNonce?: RelayNonce;
  schnorrData?: { sigOne: string; challenge: string } | null;
  tokenContract?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  sourceAddress?: string;
  evmUserOp?: string;
  vaultDescriptor: unknown;
  vaultDescriptorHash: string | undefined;
  signMessage?: string;
  dappOrigin?: string;
  /** Advisory server simulation (JSON string), display-only on the Key. */
  simulation?: string;
  allSignerKeys?: string[];
  allSignerNonces?: RelayNonce[];
}

/** Payload object of the `enterprisevaultsign` action (JSON.stringify it). */
export function buildVaultSignRelayPayload(
  input: VaultSignRelayPayloadInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    chain: input.chain,
    orgIndex: input.orgIndex,
    vaultIndex: input.vaultIndex,
    vaultName: input.vaultName,
    orgName: input.orgName,
    recipients: input.recipients,
    fee: input.fee,
    memo: input.memo,
    rawUnsignedTx: input.rawUnsignedTx,
    inputDetails: input.inputDetails,
    walletSignatures: input.walletSignatures,
    walletPubKey: input.walletPubKey,
    requestId: input.requestId,
    wkIdentity: input.wkIdentity,
    scriptType: input.scriptType,
  };

  // UTXO progressive signing: send wallet-signed TX hex so Key can add its sigs on top
  if (input.chainType !== 'evm' && input.walletSignatures.length === 1) {
    payload.walletSignedHex = input.walletSignatures[0];
  }

  // Proposal references: let the relay register the Key's signature onto the
  // proposal server-side, so signing survives even when this tab's response
  // never reaches the requesting enterprise app page.
  if (input.proposalRefs) {
    payload.orgId = input.proposalRefs.orgId;
    payload.vaultId = input.proposalRefs.vaultId;
    payload.proposalId = input.proposalRefs.proposalId;
  }

  // Include signing mode so Key knows whether to sign or pass through
  if (input.signingMode) {
    payload.signingMode = input.signingMode;
  }

  // Include Key's reserved nonce for EVM vault signing (Key uses this for its Schnorr signing)
  if (input.reservedKeyNonce) {
    payload.reservedNonce = input.reservedKeyNonce;
  }

  // Include Schnorr partial signature data for EVM vault signing
  // Key needs sigOne to sum with its own partial sig. The challenge lets the
  // relay register the signature server-side in wallet_only mode, where the
  // Key's passthrough response carries an empty challenge (the challenge
  // exists only on this device).
  if (input.schnorrData) {
    payload.sigOne = input.schnorrData.sigOne;
    if (input.schnorrData.challenge) {
      payload.challenge = input.schnorrData.challenge;
    }
  }

  // Include token metadata for Key's approval display
  if (input.tokenContract) {
    payload.tokenContract = input.tokenContract;
    payload.tokenSymbol = input.tokenSymbol;
    payload.tokenDecimals = input.tokenDecimals;
  }

  // Include source vault address for Key's approval display
  if (input.sourceAddress) {
    payload.sourceAddress = input.sourceAddress;
  }

  // Include EVM UserOp for Key's trustless decode
  if (input.evmUserOp) {
    payload.evmUserOp = input.evmUserOp;
  }

  // VD-2: the vault descriptor and its hash, verbatim as SSP Enterprise sent
  // them — SSP Key verifies and pins them independently.
  payload.vaultDescriptor = input.vaultDescriptor;
  payload.vaultDescriptorHash = input.vaultDescriptorHash;

  // Message signing (WalletConnect Phase 2): forward the message text + dApp so
  // Key shows what is being signed instead of a (non-existent) transaction.
  if (input.signMessage) {
    payload.signMessage = input.signMessage;
    if (input.dappOrigin) payload.dappOrigin = input.dappOrigin;
  }

  // Include the advisory server-computed simulation (JSON string) so the Key's
  // approve screen can render the same advisory risk strip. Display-only — the
  // Key's own trustless decode stays authoritative and signing is never gated.
  if (input.simulation) {
    payload.simulation = input.simulation;
  }

  // Include all signer keys/nonces for EVM signing
  // Key needs these to call signMultiSigMsg with the same arrays
  if (input.allSignerKeys?.length) {
    payload.allSignerKeys = input.allSignerKeys;
  }
  if (input.allSignerNonces?.length) {
    payload.allSignerNonces = input.allSignerNonces;
  }

  return payload;
}

export interface FluxNodeStartRelayPayloadInput {
  chain: string;
  orgIndex: number;
  vaultIndex: number;
  addressIndex: number;
  nodeName: string;
  collateralAmount: string;
  collateralAddress?: string;
  identityPubKey: string;
  collateralTxid: string;
  collateralVout: number;
  redeemScript: string;
  delegates: string[];
  requestId: string;
  wkIdentity: string;
  vaultDescriptor: unknown;
  vaultDescriptorHash: string | undefined;
}

/** Payload object of the `enterprisefluxnodestart` action (JSON.stringify it). */
export function buildFluxNodeStartRelayPayload(
  input: FluxNodeStartRelayPayloadInput,
): Record<string, unknown> {
  return {
    chain: input.chain,
    orgIndex: input.orgIndex,
    vaultIndex: input.vaultIndex,
    addressIndex: input.addressIndex,
    nodeName: input.nodeName,
    collateralAmount: input.collateralAmount,
    collateralAddress: input.collateralAddress,
    identityPubKey: input.identityPubKey,
    collateralTxid: input.collateralTxid,
    collateralVout: input.collateralVout,
    redeemScript: input.redeemScript,
    delegates: input.delegates,
    requestId: input.requestId,
    wkIdentity: input.wkIdentity,
    // VD-2: verbatim, for SSP Key's own verification and pin.
    vaultDescriptor: input.vaultDescriptor,
    vaultDescriptorHash: input.vaultDescriptorHash,
  };
}
