import { useEffect, useRef, useState } from 'react';
import { useSspConnect } from '../../hooks/useSspConnect';
import SignMessage from '../../components/SignMessage/SignMessage';
import PaymentRequest from '../../components/PaymentRequest/PaymentRequest';
import ChainsInfo from '../../components/ChainsInfo/ChainsInfo';
import TokensInfo from '../../components/TokensInfo/TokensInfo';
import AddressesInfo from '../../components/AddressesInfo/AddressesInfo';
import AllAddressesInfo from '../../components/AllAddressesInfo/AllAddressesInfo';
import WkSign from '../../components/WkSign/WkSign';
import EnterpriseVaultXpub from '../../components/EnterpriseVaultXpub/EnterpriseVaultXpub';
import EnterpriseVaultSignTx from '../../components/EnterpriseVaultSignTx/EnterpriseVaultSignTx';
import EnterpriseNonceSync from '../../components/EnterpriseNonceSync/EnterpriseNonceSync';
import EnterpriseFluxNodeStart from '../../components/EnterpriseFluxNodeStart/EnterpriseFluxNodeStart';
import FluxNodeStart from '../../components/FluxNodeStart/FluxNodeStart';
import VaultAddressDisplay, {
  type VaultAddressResponse,
} from '../../components/VaultAddressDisplay/VaultAddressDisplay';
import { useTranslation } from 'react-i18next';
import { cryptos } from '../../types';
import { WkSignResponse, WkSignRequesterInfo } from '../../lib/wkSign';
import RequesterOrigin from './RequesterOrigin';
import { setPendingPayRequestId } from './pendingPayRequest';

interface signMessageData {
  status: string;
  address?: string;
  signature?: string;
  message?: string;
  data?: string;
}

interface paymentData {
  status: string;
  txid?: string;
  data?: string;
}

interface wkSignData {
  status: string;
  result?: WkSignResponse;
  data?: string;
}

interface enterpriseVaultXpubData {
  status: string;
  result?: {
    xpubWallet: string;
    xpubKey: string;
    walletXpubSignature: string;
    keyXpubSignature: string;
    chain: string;
    orgIndex: number;
    wkIdentity: string;
  };
  data?: string;
}

interface NonceSyncResponse {
  status: string;
  result?: string;
  data?: string;
}

interface enterpriseVaultSignTxData {
  status: string;
  result?: {
    walletSignatures: string[];
    keySignatures: string[];
    walletPubKey: string;
    keyPubKey: string;
    wkIdentity: string;
    chain: string;
    orgIndex: number;
    vaultIndex: number;
    signedHex?: string;
  };
  data?: string;
  errorCode?: string;
}

/**
 * Flux node delegate public keys arrive as a JSON string in the shared
 * `recipients` slot, which other request types fill with objects. Accept only
 * an array of strings so a stale payment proposal can never reach the node
 * dialogs' string rendering.
 */
function parseDelegates(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is string => typeof d === 'string');
  } catch {
    return [];
  }
}

function SspConnect() {
  const {
    requestId: sspConnectRequestId,
    address: sspConnectAddress,
    message: sspConnectMessage,
    chain: sspConnectChain,
    amount: sspConnectAmount,
    type: sspConnectType,
    contract: sspConnectContract,
    authMode: sspConnectAuthMode,
    requesterInfo: sspConnectRequesterInfo,
    orgIndex: sspConnectOrgIndex,
    vaultName: sspConnectVaultName,
    orgName: sspConnectOrgName,
    vaultIndex: sspConnectVaultIndex,
    recipients: sspConnectRecipients,
    fee: sspConnectFee,
    memo: sspConnectMemo,
    rawUnsignedTx: sspConnectRawUnsignedTx,
    inputDetails: sspConnectInputDetails,
    reservedNonce: sspConnectReservedNonce,
    reservedKeyNonce: sspConnectReservedKeyNonce,
    keyXpub: sspConnectKeyXpub,
    allSignerKeys: sspConnectAllSignerKeys,
    allSignerNonces: sspConnectAllSignerNonces,
    tokenContract: sspConnectTokenContract,
    tokenSymbol: sspConnectTokenSymbol,
    tokenDecimals: sspConnectTokenDecimals,
    sourceAddress: sspConnectSourceAddress,
    evmUserOp: sspConnectEvmUserOp,
    signingMode: sspConnectSigningMode,
    simulation: sspConnectSimulation,
    proposalRefs: sspConnectProposalRefs,
    signMessage: sspConnectSignMessage,
    dappOrigin: sspConnectDappOrigin,
    vaultDescriptor: sspConnectVaultDescriptor,
    vaultDescriptorHash: sspConnectVaultDescriptorHash,
    vaultTypeIndex: sspConnectVaultTypeIndex,
    vaultAddressIndex: sspConnectVaultAddressIndex,
    expectedAddress: sspConnectExpectedAddress,
    clearRequest,
  } = useSspConnect();
  const { t } = useTranslation(['common', 'home']);
  const [openSignMessage, setOpenSignMessage] = useState(false);
  const [openPayRequest, setOpenPayRequest] = useState(false);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [chain, setChain] = useState('');
  const [amount, setAmount] = useState('');
  const browser = window.chrome || window.browser;
  const [contract, setContract] = useState('');
  const [openChainsInfo, setOpenChainsInfo] = useState(false);
  const [userOnlyChains, setUserOnlyChains] = useState(false);
  const [openTokensInfo, setOpenTokensInfo] = useState(false);
  const [openAddressesInfo, setOpenAddressesInfo] = useState(false);
  const [openAllAddressesInfo, setOpenAllAddressesInfo] = useState(false);
  const [openWkSign, setOpenWkSign] = useState(false);
  const [authMode, setAuthMode] = useState<1 | 2>(2);
  const [requesterInfo, setRequesterInfo] =
    useState<WkSignRequesterInfo | null>(null);
  const [openEnterpriseVaultXpub, setOpenEnterpriseVaultXpub] = useState(false);
  const [openEnterpriseVaultSignTx, setOpenEnterpriseVaultSignTx] =
    useState(false);
  const [openEnterpriseNonceSync, setOpenEnterpriseNonceSync] = useState(false);
  const [openEnterpriseFluxNodeStart, setOpenEnterpriseFluxNodeStart] =
    useState(false);
  const [openFluxNodeStart, setOpenFluxNodeStart] = useState(false);
  const [orgIndex, setOrgIndex] = useState(0);
  const [vaultName, setVaultName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [vaultIndex, setVaultIndex] = useState(0);
  const [recipients, setRecipients] = useState('');
  const [txFee, setTxFee] = useState('');
  const [txMemo, setTxMemo] = useState('');
  const [rawUnsignedTx, setRawUnsignedTx] = useState('');
  const [inputDetails, setInputDetails] = useState('');
  // WalletConnect Phase 2 — vault message signing (reuses the sign-tx modal).
  const [signMessage, setSignMessage] = useState<string | undefined>(undefined);
  const [dappOrigin, setDappOrigin] = useState<string | undefined>(undefined);
  const [reservedNonce, setReservedNonce] = useState<
    { kPublic: string; kTwoPublic: string } | undefined
  >(undefined);
  const [reservedKeyNonce, setReservedKeyNonce] = useState<
    { kPublic: string; kTwoPublic: string } | undefined
  >(undefined);
  const [keyXpub, setKeyXpub] = useState<string | undefined>(undefined);
  const [allSignerKeys, setAllSignerKeys] = useState<string[] | undefined>(
    undefined,
  );
  const [allSignerNonces, setAllSignerNonces] = useState<
    Array<{ kPublic: string; kTwoPublic: string }> | undefined
  >(undefined);
  const [tokenContract, setTokenContract] = useState<string | undefined>(
    undefined,
  );
  const [tokenSymbol, setTokenSymbol] = useState<string | undefined>(undefined);
  const [tokenDecimals, setTokenDecimals] = useState<number | undefined>(
    undefined,
  );
  const [sourceAddress, setSourceAddress] = useState<string | undefined>(
    undefined,
  );
  const [evmUserOp, setEvmUserOp] = useState<string | undefined>(undefined);
  const [signingMode, setSigningMode] = useState<string | undefined>(undefined);
  const [simulation, setSimulation] = useState<string | undefined>(undefined);
  // VD: vault descriptor + hash for the enterprise vault dialogs, and the
  // enterprise_vault_address (VD-5) request.
  const [vaultDescriptor, setVaultDescriptor] = useState<unknown>(undefined);
  const [vaultDescriptorHash, setVaultDescriptorHash] = useState<
    string | undefined
  >(undefined);
  const [openVaultAddress, setOpenVaultAddress] = useState(false);
  const [vaultTypeIndex, setVaultTypeIndex] = useState<number | undefined>(
    undefined,
  );
  const [vaultAddressIndex, setVaultAddressIndex] = useState(0);
  const [expectedAddress, setExpectedAddress] = useState('');
  const [proposalRefs, setProposalRefs] = useState<
    { orgId: string; vaultId: string; proposalId: string } | undefined
  >(undefined);
  // Background request id of the request the open dialog answers. The
  // background allows ONE dApp request in flight and resolves it only with a
  // reply echoing this id (security review WEXT-3).
  const requestIdRef = useRef('');

  /** Send the answer to the in-flight dApp request back to background.js. */
  const sendReply = (data: unknown) => {
    if (!browser?.runtime?.sendMessage) {
      console.log('no browser or chrome runtime.sendMessage');
      return;
    }
    void browser.runtime.sendMessage({
      origin: 'ssp',
      requestId: requestIdRef.current,
      data,
    });
  };

  useEffect(() => {
    console.log(sspConnectMessage);
    if (sspConnectType) {
      requestIdRef.current = sspConnectRequestId;
      // Every dialog names the browser-verified requester.
      setRequesterInfo(sspConnectRequesterInfo);
      setAddress(sspConnectAddress);
      setMessage(sspConnectMessage);
      setChain(sspConnectChain);
      setAmount(sspConnectAmount);
      setContract(sspConnectContract);
      if (
        sspConnectType === 'sign_message' ||
        sspConnectType === 'sspwid_sign_message'
      ) {
        setOpenSignMessage(true);
      } else if (sspConnectType === 'wk_sign_message') {
        // wk_sign uses authMode from request (1 = wallet only, 2 = wallet + key)
        setAuthMode(sspConnectAuthMode === 1 ? 1 : 2);
        // Capture requesterInfo before clearRequest clears it
        setRequesterInfo(sspConnectRequesterInfo);
        setOpenWkSign(true);
      } else if (sspConnectType === 'pay') {
        // show poup with information that we are going to pay after user approval
        // here we should navigate to send page, change chain and input proper address, message, amount.
        console.log(amount);
        setOpenPayRequest(true);
      } else if (sspConnectType === 'chains_info') {
        // show poup that someone is asking to get all chains information and what information is being given
        setUserOnlyChains(false);
        setOpenChainsInfo(true);
      } else if (sspConnectType === 'user_chains_info') {
        // show poup that someone is asking to get all chains information and what information is being given
        setUserOnlyChains(true);
        setOpenChainsInfo(true);
      } else if (sspConnectType === 'chain_tokens') {
        // show poup that someone is asking to get all tokens for a chain
        setOpenTokensInfo(true);
      } else if (sspConnectType === 'user_addresses') {
        // show poup that someone is asking to get all addresses for a chain
        setOpenAddressesInfo(true);
      } else if (sspConnectType === 'user_chains_addresses_all') {
        // show poup that someone is asking to get all addresses for all chains
        setOpenAllAddressesInfo(true);
      } else if (sspConnectType === 'enterprise_vault_xpub') {
        // Enterprise vault xpub request - capture params before clearRequest.
        // vaultIndex is required for Solana so the wallet derives the
        // pubkey array at the per-vault HD typeIndex slot (matches Key
        // which receives vaultIndex in the relay payload).
        setRequesterInfo(sspConnectRequesterInfo);
        setOrgIndex(sspConnectOrgIndex);
        setVaultIndex(sspConnectVaultIndex);
        setVaultName(sspConnectVaultName);
        setOrgName(sspConnectOrgName);
        setOpenEnterpriseVaultXpub(true);
      } else if (sspConnectType === 'enterprise_vault_sign_tx') {
        // Enterprise vault sign tx request - capture params before clearRequest
        setRequesterInfo(sspConnectRequesterInfo);
        setOrgIndex(sspConnectOrgIndex);
        setVaultIndex(sspConnectVaultIndex);
        setVaultName(sspConnectVaultName);
        setOrgName(sspConnectOrgName);
        setRecipients(sspConnectRecipients);
        setTxFee(sspConnectFee);
        setTxMemo(sspConnectMemo);
        setRawUnsignedTx(sspConnectRawUnsignedTx);
        setInputDetails(sspConnectInputDetails);
        setReservedNonce(sspConnectReservedNonce);
        setReservedKeyNonce(sspConnectReservedKeyNonce);
        setKeyXpub(sspConnectKeyXpub);
        setAllSignerKeys(sspConnectAllSignerKeys);
        setAllSignerNonces(sspConnectAllSignerNonces);
        setTokenContract(sspConnectTokenContract);
        setTokenSymbol(sspConnectTokenSymbol);
        setTokenDecimals(sspConnectTokenDecimals);
        setSourceAddress(sspConnectSourceAddress);
        setEvmUserOp(sspConnectEvmUserOp);
        setSigningMode(sspConnectSigningMode);
        setSimulation(sspConnectSimulation);
        setProposalRefs(sspConnectProposalRefs);
        setSignMessage(sspConnectSignMessage);
        setDappOrigin(sspConnectDappOrigin);
        setVaultDescriptor(sspConnectVaultDescriptor);
        setVaultDescriptorHash(sspConnectVaultDescriptorHash);
        setOpenEnterpriseVaultSignTx(true);
      } else if (sspConnectType === 'enterprise_flux_node_start') {
        // Enterprise Flux node start request
        setRequesterInfo(sspConnectRequesterInfo);
        setOrgIndex(sspConnectOrgIndex);
        setVaultIndex(sspConnectVaultIndex);
        setChain(sspConnectChain);
        setVaultName(sspConnectVaultName); // node name
        setOrgName(sspConnectOrgName); // collateral amount
        setRecipients(sspConnectRecipients); // delegates JSON
        setMessage(sspConnectMessage); // identity key
        setAddress(sspConnectAddress); // collateral txid
        setAmount(sspConnectAmount); // collateral vout
        setContract(sspConnectContract); // redeemScript
        setTxMemo(sspConnectMemo); // signing device
        setTxFee(sspConnectFee); // addressIndex
        setSourceAddress(sspConnectSourceAddress); // collateral (vault) address
        setVaultDescriptor(sspConnectVaultDescriptor);
        setVaultDescriptorHash(sspConnectVaultDescriptorHash);
        setOpenEnterpriseFluxNodeStart(true);
      } else if (sspConnectType === 'flux_node_start') {
        // Consumer Flux node start request
        setRequesterInfo(sspConnectRequesterInfo);
        setChain(sspConnectChain);
        setMessage(sspConnectMessage); // identity pub key
        setAddress(sspConnectAddress); // collateral txid
        setAmount(sspConnectAmount); // collateral vout
        setSourceAddress(sspConnectSourceAddress); // collateral address
        setVaultName(sspConnectVaultName); // node name
        setOrgName(sspConnectOrgName); // collateral amount
        setRecipients(sspConnectRecipients); // delegates JSON
        setOpenFluxNodeStart(true);
      } else if (sspConnectType === 'enterprise_vault_address') {
        // VD-5: show a vault address derived on this device.
        setRequesterInfo(sspConnectRequesterInfo);
        setVaultName(sspConnectVaultName);
        setOrgName(sspConnectOrgName);
        setVaultDescriptor(sspConnectVaultDescriptor);
        setVaultDescriptorHash(sspConnectVaultDescriptorHash);
        setVaultTypeIndex(sspConnectVaultTypeIndex);
        setVaultAddressIndex(sspConnectVaultAddressIndex ?? 0);
        setExpectedAddress(sspConnectExpectedAddress ?? '');
        setOpenVaultAddress(true);
      } else if (sspConnectType === 'enterprise_nonce_sync') {
        // Enterprise nonce sync request — interactive dialog
        setRequesterInfo(sspConnectRequesterInfo);
        setOpenEnterpriseNonceSync(true);
      } else {
        generalAction({
          status: 'ERROR', // do not translate
          data:
            t('common:request_rejected') +
            ': ' +
            t('home:sspConnect.invalid_method'),
        });
      }
      console.log('sspConnectType');
      console.log(sspConnectType);
      clearRequest?.();
    }
  }, [sspConnectType]);

  const generalAction = (data: signMessageData | null) => {
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
    setOpenSignMessage(false);
    setOpenChainsInfo(false);
    setOpenTokensInfo(false);
    setOpenAddressesInfo(false);
    setOpenAllAddressesInfo(false);
    setOpenWkSign(false);
    setOpenEnterpriseVaultXpub(false);
    setOpenEnterpriseVaultSignTx(false);
    setOpenEnterpriseNonceSync(false);
  };

  const wkSignAction = (data: wkSignData | null) => {
    console.log('[WkSign] Action result:', data);
    setOpenWkSign(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };
  const enterpriseVaultXpubAction = (data: enterpriseVaultXpubData | null) => {
    console.log('[EnterpriseVaultXpub] Action result:', data);
    setOpenEnterpriseVaultXpub(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };
  const enterpriseVaultSignTxAction = (
    data: enterpriseVaultSignTxData | null,
  ) => {
    console.log('[EnterpriseVaultSignTx] Action result:', data?.status);
    setOpenEnterpriseVaultSignTx(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };
  const enterpriseFluxNodeStartAction = (
    data: { status: string; result?: { signedTxHex: string } } | null,
  ) => {
    setOpenEnterpriseFluxNodeStart(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };

  const vaultAddressAction = (data: VaultAddressResponse | null) => {
    setOpenVaultAddress(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };

  const fluxNodeStartAction = (
    data: { status: string; result?: { signedTxHex: string } } | null,
  ) => {
    setOpenFluxNodeStart(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };

  const enterpriseNonceSyncAction = (data: NonceSyncResponse | null) => {
    setOpenEnterpriseNonceSync(false);
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };
  const payRequestAction = (data: paymentData | null | 'continue') => {
    console.log(data);
    setOpenPayRequest(false);
    if (data === 'continue') {
      // The send flow answers this request once the payment is broadcast or
      // cancelled; it echoes this id with its reply.
      setPendingPayRequestId(requestIdRef.current);
      return;
    }
    sendReply(
      data ?? { status: 'ERROR', result: t('common:request_rejected') },
    );
  };
  return (
    <>
      <SignMessage
        open={openSignMessage}
        openAction={generalAction}
        address={address}
        message={message}
        chain={chain as keyof cryptos}
        requesterInfo={requesterInfo}
      />
      {/* The verified requester, pinned above the dialogs that don't render
          it themselves (WEXT-6). */}
      <RequesterOrigin
        variant="banner"
        requesterInfo={requesterInfo}
        open={
          openPayRequest ||
          openChainsInfo ||
          openTokensInfo ||
          openAddressesInfo ||
          openAllAddressesInfo
        }
      />
      <PaymentRequest
        open={openPayRequest}
        openAction={payRequestAction}
        address={address}
        message={message}
        amount={amount}
        contract={contract}
        chain={chain as keyof cryptos}
      />
      <ChainsInfo
        open={openChainsInfo}
        openAction={generalAction}
        userOnly={userOnlyChains}
      />
      <TokensInfo
        open={openTokensInfo}
        openAction={generalAction}
        chain={chain as keyof cryptos}
      />
      <AddressesInfo
        open={openAddressesInfo}
        openAction={generalAction}
        chain={chain}
      />
      <AllAddressesInfo
        open={openAllAddressesInfo}
        openAction={generalAction}
      />
      <WkSign
        open={openWkSign}
        openAction={wkSignAction}
        message={message}
        authMode={authMode}
        requesterInfo={requesterInfo}
      />
      <EnterpriseVaultXpub
        open={openEnterpriseVaultXpub}
        openAction={enterpriseVaultXpubAction}
        chain={chain}
        orgIndex={orgIndex}
        vaultIndex={vaultIndex}
        vaultName={vaultName}
        orgName={orgName}
        requesterInfo={requesterInfo}
      />
      <EnterpriseVaultSignTx
        open={openEnterpriseVaultSignTx}
        openAction={enterpriseVaultSignTxAction}
        chain={chain}
        orgIndex={orgIndex}
        vaultIndex={vaultIndex}
        recipients={recipients}
        fee={txFee}
        memo={txMemo}
        rawUnsignedTx={rawUnsignedTx}
        inputDetails={inputDetails}
        vaultName={vaultName}
        orgName={orgName}
        requesterInfo={requesterInfo}
        reservedNonce={reservedNonce}
        reservedKeyNonce={reservedKeyNonce}
        keyXpub={keyXpub}
        allSignerKeys={allSignerKeys}
        allSignerNonces={allSignerNonces}
        tokenContract={tokenContract}
        tokenSymbol={tokenSymbol}
        tokenDecimals={tokenDecimals}
        sourceAddress={sourceAddress}
        evmUserOp={evmUserOp}
        signingMode={signingMode}
        simulation={simulation}
        proposalRefs={proposalRefs}
        signMessage={signMessage}
        dappOrigin={dappOrigin}
        vaultDescriptor={vaultDescriptor}
        vaultDescriptorHash={vaultDescriptorHash}
      />
      <EnterpriseNonceSync
        open={openEnterpriseNonceSync}
        openAction={enterpriseNonceSyncAction}
        requesterInfo={requesterInfo}
      />
      <FluxNodeStart
        open={openFluxNodeStart}
        openAction={fluxNodeStartAction}
        requesterInfo={requesterInfo}
        chain={chain}
        collateralAddress={sourceAddress ?? ''}
        collateralTxid={address}
        collateralVout={parseInt(amount, 10) || 0}
        collateralAmount={orgName}
        identityPubKey={message}
        nodeName={vaultName}
        delegates={parseDelegates(recipients)}
      />
      <EnterpriseFluxNodeStart
        open={openEnterpriseFluxNodeStart}
        openAction={enterpriseFluxNodeStartAction}
        requesterInfo={requesterInfo}
        chain={chain}
        orgIndex={orgIndex}
        vaultIndex={vaultIndex}
        addressIndex={parseInt(txFee, 10) || 0}
        nodeName={vaultName}
        collateralAmount={orgName}
        collateralAddress={sourceAddress}
        identityPubKey={message}
        collateralTxid={address}
        collateralVout={parseInt(amount, 10) || 0}
        redeemScript={contract}
        signingDevice={txMemo as 'wallet' | 'key'}
        delegates={parseDelegates(recipients)}
        vaultDescriptor={vaultDescriptor}
        vaultDescriptorHash={vaultDescriptorHash}
      />
      <VaultAddressDisplay
        open={openVaultAddress}
        openAction={vaultAddressAction}
        requesterInfo={requesterInfo}
        vaultDescriptor={vaultDescriptor}
        vaultDescriptorHash={vaultDescriptorHash}
        typeIndex={vaultTypeIndex}
        addressIndex={vaultAddressIndex}
        expectedAddress={expectedAddress}
        vaultName={vaultName}
        orgName={orgName}
      />
    </>
  );
}

export default SspConnect;
