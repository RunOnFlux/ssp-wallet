import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Alert,
  Form,
  message,
  Divider,
  Button,
  Input,
  Select,
  Space,
} from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';

import Navbar from '../../components/Navbar/Navbar';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setContacts } from '../../store';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { getFingerprint } from '../../lib/fingerprint';
import {
  generateAddressKeypair,
  generateMultisigAddressSOL,
  getScriptType,
  signSolanaInitMessage,
} from '../../lib/wallet';
import { constructAndSignSOLTransaction } from '../../lib/constructTx';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import './SendSOL.css';

interface sendForm {
  receiver: string;
  amount: string;
  token: string; // mint address (base58) or '' for native SOL
}

interface LocationState {
  receiver?: string;
  amount?: string;
}

let txSentInterval: ReturnType<typeof setInterval> | undefined;

function SendSOL() {
  const [form] = Form.useForm<sendForm>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state || {}) as LocationState;
  const { createWkIdentityAuth } = useRelayAuth();

  const dispatch = useAppDispatch();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { xpubKey, xpubWallet, walletInUse, wallets } = useAppSelector(
    (state) => state[activeChain],
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const { contacts } = useAppSelector((state) => state.contacts);

  const blockchainConfig = blockchains[activeChain];

  // Build token options for the selector. The first entry (contract '')
  // is always native SOL; subsequent entries are SPL tokens.
  const tokenOptions = useMemo(
    () =>
      blockchainConfig.tokens.map((t) => ({
        value: t.contract, // '' for native, mint address for SPL
        label: `${t.symbol} — ${t.name}`,
        decimals: t.decimals,
      })),
    [blockchainConfig.tokens],
  );

  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayMessage = (type: NoticeType, content: string) => {
    void message.open({ type, content });
  };

  const postAction = async (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
  ) => {
    const data: Record<string, unknown> = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
    };
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch (error) {
      console.warn('[SendSOL postAction] auth unavailable', error);
    }
    return axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  const validateRecipient = (addr: string): boolean => {
    // Solana addresses are base58, 32-44 chars typically
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  };

  /**
   * Check if the SSP Solana multisig at this address index is already
   * initialized on-chain. If yes, return null (no init sigs needed). If
   * no, derive wallet's init signature locally, request key's init sig
   * via 'solinitsigrequest' action + poll the relay for 'solinitsig'
   * response, and return both signatures.
   *
   * Polls every 1.5s up to 60s — user has time to approve on the key
   * device. Throws if no response within the window.
   */
  const maybeGatherInitSignatures = async (args: {
    chain: keyof typeof blockchains;
    walletPubkey: string;
    keyPubkey: string;
    walletPrivKeyHex: string;
    derivationPath: string;
  }): Promise<{ walletSig: string; keySig: string } | null> => {
    const { Connection, PublicKey } = await import('@solana/web3.js');
    const { SolanaMultisigClient, deriveMultisigAddress } = await import(
      '@runonflux/solana-multisig'
    );
    const cfg = blockchains[args.chain];
    if (!cfg.programId) throw new Error(`No programId for ${args.chain}`);
    const programId = new PublicKey(cfg.programId);
    const conn = new Connection(`https://${cfg.node}`, {
      commitment: 'confirmed',
    });
    const client = new SolanaMultisigClient(conn, programId);
    const [multisigPda] = deriveMultisigAddress(
      [new PublicKey(args.walletPubkey), new PublicKey(args.keyPubkey)],
      2,
      programId,
    );
    const existing = await client.getMultisig(multisigPda);
    if (existing) return null; // already initialized

    // Wallet signs the init message locally.
    const walletSig = signSolanaInitMessage(
      args.walletPrivKeyHex,
      args.walletPubkey,
      args.keyPubkey,
    );

    // Ask key to sign too.
    await postAction(
      'solinitsigrequest',
      '',
      args.chain,
      args.derivationPath,
      sspWalletKeyInternalIdentity,
    );

    // Poll relay for key's signature.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const resp = await axios.get<{
          action: string;
          chain: string;
          payload: string;
        }>(
          `https://${sspConfig().relay}/v1/action/${sspWalletKeyInternalIdentity}`,
        );
        if (
          resp.data &&
          resp.data.action === 'solinitsig' &&
          resp.data.chain === args.chain &&
          resp.data.payload
        ) {
          return { walletSig, keySig: resp.data.payload };
        }
      } catch (e) {
        console.log('[SOL init-sig] poll error', e);
      }
    }
    throw new Error(
      'Timed out waiting for key device to sign Solana multisig init',
    );
  };

  const onFinish = (values: sendForm) => {
    if (!validateRecipient(values.receiver)) {
      displayMessage('error', 'Invalid Solana recipient address');
      return;
    }
    if (!values.amount || isNaN(+values.amount) || +values.amount <= 0) {
      displayMessage('error', 'Invalid amount');
      return;
    }
    if (!xpubKey || !xpubKey.startsWith('[')) {
      displayMessage(
        'error',
        'Solana pairing not complete — partner pubkey array missing',
      );
      return;
    }
    if (!xpubWallet || !xpubWallet.startsWith('[')) {
      displayMessage(
        'error',
        'Solana wallet pubkey array missing — re-init chain',
      );
      return;
    }

    setSubmitting(true);
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string') {
          throw new Error('Password decryption failed');
        }
        const xprivBlob = secureLocalStorage.getItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xprivBlob !== 'string') {
          throw new Error('Wallet xpriv missing from secure storage');
        }
        let xprivChain = await passworderDecrypt(password, xprivBlob);
        password = null;
        if (typeof xprivChain !== 'string') {
          throw new Error('xpriv decrypt failed');
        }

        // Pull this address index's leaf pubkeys from the JSON-stringified
        // arrays cached in xpubWallet/xpubKey for sol chains.
        const wInUse = walletInUse;
        const splittedDerPath = wInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];

        // Derive our leaf signing keypair for the active address index.
        const keyPair = generateAddressKeypair(
          xprivChain,
          0,
          addressIndex,
          activeChain,
        );
        xprivChain = null;

        // Convert UI amount → base units, using the selected token's decimals.
        const selectedToken = tokenOptions.find(
          (t) => t.value === values.token,
        );
        const decimals =
          selectedToken?.decimals ?? blockchainConfig.decimals;
        const baseUnits = new BigNumber(values.amount)
          .multipliedBy(10 ** decimals)
          .toFixed(0);
        const tokenMintBase58 = values.token || undefined; // '' → native SOL

        // Pre-flight balance check — fail clearly before relay round-trip.
        // Vault PDA holds the funds (regardless of native vs SPL).
        const vaultInfo = generateMultisigAddressSOL(
          walletPubkeys[addressIndex],
          keyPubkeys[addressIndex],
          0,
          activeChain,
        );
        if (tokenMintBase58) {
          const tokenBalances = await fetchAddressTokenBalances(
            vaultInfo.address,
            activeChain,
            [tokenMintBase58],
          );
          const tokenBal = tokenBalances.find(
            (b) => b.contract === tokenMintBase58,
          );
          if (
            !tokenBal ||
            new BigNumber(tokenBal.balance).lt(baseUnits)
          ) {
            throw new Error(
              `Insufficient ${selectedToken?.label ?? 'token'} balance in vault`,
            );
          }
        } else {
          const bal = await fetchAddressBalance(vaultInfo.address, activeChain);
          if (new BigNumber(bal.confirmed).lt(baseUnits)) {
            throw new Error('Insufficient SOL balance in vault');
          }
        }

        // Fetch the relay's paymaster pubkey — used as feePayer so users
        // don't need SOL in their leaf keypair (vault PDA is the visible
        // deposit address; relay sponsors tx fees + auto-tops-up the leaf
        // for proposal rent).
        const paymasterResp = await axios.get<{
          status: string;
          data: { pubkey?: string; message?: string };
        }>(
          `https://${sspConfig().relay}/v1/sol/paymaster?chain=${activeChain}`,
        );
        if (
          paymasterResp.data.status !== 'success' ||
          !paymasterResp.data.data?.pubkey
        ) {
          throw new Error(
            `Solana paymaster unavailable: ${
              paymasterResp.data.data?.message ?? 'unknown'
            }`,
          );
        }
        const paymasterPubkey = paymasterResp.data.data.pubkey;

        // Determine whether the multisig is already initialized on-chain.
        // If not, we bundle init+send atomically; that requires both
        // members' Ed25519 signatures over the init message ahead of time.
        const initSigs = await maybeGatherInitSignatures({
          chain: activeChain,
          walletPubkey: walletPubkeys[addressIndex],
          keyPubkey: keyPubkeys[addressIndex],
          walletPrivKeyHex: keyPair.privKey,
          derivationPath: wInUse,
        });

        const signedTxBase64 = await constructAndSignSOLTransaction({
          chain: activeChain,
          recipient: values.receiver,
          amount: baseUnits,
          walletPubkeyBase58: walletPubkeys[addressIndex],
          keyPubkeyBase58: keyPubkeys[addressIndex],
          walletPrivKeyHex: keyPair.privKey,
          paymasterPubkeyBase58: paymasterPubkey,
          tokenMintBase58,
          initSignatureWalletBase64: initSigs?.walletSig,
          initSignatureKeyBase64: initSigs?.keySig,
        });

        await postAction(
          'tx',
          signedTxBase64,
          activeChain,
          wInUse,
          sspWalletKeyInternalIdentity,
        );

        setTxHex(signedTxBase64);
        setOpenConfirmTx(true);
        setSubmitting(false);

        // Save recipient to contacts (if new and not one of our own addresses).
        const contactExists = contacts[activeChain]?.find(
          (c) => c.address === values.receiver,
        );
        const myAddresses: string[] = Object.keys(wallets).map(
          (w) => wallets[w].address,
        );
        if (!contactExists && !myAddresses.includes(values.receiver)) {
          const newContact = {
            id: new Date().getTime(),
            name: '',
            address: values.receiver,
          };
          const adjContacts = [...(contacts[activeChain] ?? []), newContact];
          const completeContacts = {
            ...contacts,
            [activeChain]: adjContacts,
          };
          dispatch(setContacts(completeContacts));
          void localForage
            .setItem('contacts', completeContacts)
            .catch((error) => console.log(error));
        }
      })
      .catch((error: Error) => {
        console.log(error);
        setSubmitting(false);
        displayMessage('error', error?.message || 'Send failed');
      });
  };

  const txSentAction = (status: boolean) => {
    setOpenTxSent(status);
    setOpenConfirmTx(false);
    if (txSentInterval) {
      clearInterval(txSentInterval);
    }
    if (status) {
      navigate('/home');
    }
  };

  const txRejectedAction = (status: boolean) => {
    setOpenTxRejected(status);
    setOpenConfirmTx(false);
    if (txSentInterval) {
      clearInterval(txSentInterval);
    }
  };

  return (
    <>
      <Navbar refresh={() => {}} hasRefresh={false} />
      <Divider />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <h2>Send {blockchainConfig.symbol}</h2>
        <Alert
          type="info"
          showIcon
          message="Fees sponsored by SSP"
          description="Network fees and account rent for Solana sends are paid by the SSP relay paymaster — you don't need any SOL set aside for fees."
        />
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            receiver: locationState.receiver || '',
            amount: locationState.amount || '',
            token: '',
          }}
        >
          <Form.Item
            label="Token"
            name="token"
            rules={[{ required: true, message: 'Token required' }]}
          >
            <Select
              options={tokenOptions.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="Recipient address"
            name="receiver"
            rules={[{ required: true, message: 'Recipient required' }]}
          >
            <Input placeholder="Solana address (base58)" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Amount"
            name="amount"
            rules={[{ required: true, message: 'Amount required' }]}
          >
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="0.001"
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Send
            </Button>
          </Form.Item>
        </Form>
      </Space>
      <ConfirmTxKey
        open={openConfirmTx}
        openAction={txSentAction}
        txHex={txHex}
        chain={activeChain}
        wallet={walletInUse}
      />
      <TxSent
        open={openTxSent}
        openAction={txSentAction}
        txid={txHex}
        chain={activeChain}
      />
      <TxRejected open={openTxRejected} openAction={txRejectedAction} />
    </>
  );
}

export default SendSOL;
