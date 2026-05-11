import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Form,
  message,
  Divider,
  Button,
  Input,
  Space,
  Popconfirm,
  Select,
  theme,
} from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { QuestionCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import localForage from 'localforage';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { useTranslation } from 'react-i18next';

import Navbar from '../../components/Navbar/Navbar';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux';
import SspConnect from '../../components/SspConnect/SspConnect';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useSocket } from '../../hooks/useSocket';
import { setContacts } from '../../store';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { getFingerprint } from '../../lib/fingerprint';
import {
  generateAddressKeypair,
  generateMultisigAddressSOL,
  getScriptType,
} from '../../lib/wallet';
import {
  getSolanaMultisigInitState,
  constructAndSignSOLTransaction,
} from '../../lib/constructTx';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances';
import { sspConfig } from '@storage/ssp';
import { blockchains } from '@storage/blockchains';
import { getDisplayName } from '../../storage/walletNames';
import './SendSOL.css';

interface contactOption {
  label: string;
  index?: string;
  value: string;
}

interface contactsInterface {
  label: string;
  options: contactOption[];
}

interface tokenOption {
  label: string;
  value: string;
}

interface sendForm {
  receiver: string;
  amount: string;
  asset: string;
  fee: string;
}

interface LocationState {
  receiver?: string;
  amount?: string;
  contract?: string;
}

interface FeeSchedule {
  subsequentSendLamports: number;
  firstSendLamports: number;
  splFeeBumpLamports: number;
  minReimbursementLamports: number;
}

let txSentInterval: ReturnType<typeof setInterval> | undefined;

function SendSOL() {
  const { token } = theme.useToken();
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm<sendForm>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const [messageApi, contextHolder] = message.useMessage();
  const dispatch = useAppDispatch();

  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (s) => s.sspState,
  );
  const { xpubKey, xpubWallet, walletInUse, wallets, importedTokens } =
    useAppSelector((s) => s[activeChain]);
  const { passwordBlob } = useAppSelector((s) => s.passwordBlob);
  const { contacts } = useAppSelector((s) => s.contacts);
  const walletNames = useAppSelector(
    (s) => s.walletNames?.chains[activeChain] || {},
  );

  const blockchainConfig = blockchains[activeChain];
  const { createWkIdentityAuth } = useRelayAuth();

  // Socket-delivered txid for SUBSEQUENT-send path (Key broadcasts and
  // posts `txid` back; SocketContext relays it here). First-send path
  // (merged flow) gets txid synchronously from the broadcast call.
  const {
    txid: socketTxid,
    clearTxid,
    txRejected: socketTxRejected,
    chain: socketChain,
    clearTxRejected,
  } = useSocket();

  // Local UI state — mirrors SendEVM's pattern.
  const [txReceiver, setTxReceiver] = useState('');
  const [txToken, setTxToken] = useState(''); // mint or '' for native
  const [sendingAmount, setSendingAmount] = useState('0');
  const [txFee, setTxFee] = useState('0');
  const [manualFee, setManualFee] = useState(false);
  const [autoFee, setAutoFee] = useState('0'); // baseline used for floor + reset
  const [spendableBalance, setSpendableBalance] = useState('0');
  const [validateStatusAmount, setValidateStatusAmount] = useState<
    '' | 'success' | 'error' | 'warning' | 'validating' | undefined
  >('success');
  const [useMaximum, setUseMaximum] = useState(false);
  const [contactsItems, setContactsItems] = useState<contactsInterface[]>([]);
  const [tokenItems, setTokenItems] = useState<tokenOption[]>([]);
  const [feeSchedule, setFeeSchedule] = useState<FeeSchedule | null>(null);
  const [paymasterPubkey, setPaymasterPubkey] = useState('');
  const [needsInit, setNeedsInit] = useState(true);

  // Submit-flow state.
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({ type, content });
  };

  // Socket-delivered txid (subsequent-send path — Key broadcasts and posts
  // `txid` back via the standard relay action). Closes the wait modal and
  // opens the success modal. First-send path doesn't go through this —
  // the broadcast call returns the txid synchronously inline.
  useEffect(() => {
    if (socketTxid && socketChain === activeChain) {
      setTxHex(socketTxid);
      setOpenConfirmTx(false);
      setOpenTxSent(true);
      setSubmitting(false);
      clearTxid?.();
    }
  }, [socketTxid, socketChain, activeChain, clearTxid]);

  useEffect(() => {
    if (socketTxRejected && socketChain === activeChain) {
      setOpenConfirmTx(false);
      setOpenTxRejected(true);
      setSubmitting(false);
      clearTxRejected?.();
    }
  }, [socketTxRejected, socketChain, activeChain, clearTxRejected]);

  // Pre-fill from navigation state (deep-link / payment request).
  useEffect(() => {
    if (state.amount) {
      setSendingAmount(state.amount);
      form.setFieldValue('amount', state.amount);
    }
    if (state.receiver) {
      setTxReceiver(state.receiver);
      form.setFieldValue('receiver', state.receiver);
    }
  }, [state.receiver, state.amount]);

  // Token list = blockchain presets + imported, filtered by activated.
  useEffect(() => {
    const activated = (wallets[walletInUse]?.activatedTokens || []).slice();
    activated.push(blockchainConfig.tokens[0].contract); // native is always active
    const all = blockchainConfig.tokens.concat(importedTokens ?? []);
    const filtered = all.filter((tk) => activated.includes(tk.contract));
    const items: tokenOption[] = filtered.map((tk) => ({
      label: tk.name + ' (' + tk.symbol + ')',
      value: tk.contract,
    }));
    setTokenItems(items);
    // Default to native SOL if state didn't pick a contract.
    const initial = state.contract || blockchainConfig.tokens[0].contract;
    setTxToken(initial);
    form.setFieldValue('asset', initial);
  }, [activeChain, importedTokens, walletInUse, state.contract]);

  // Contacts + own-wallets dropdown for receiver field.
  useEffect(() => {
    const wItems: contactOption[] = [];
    Object.keys(wallets).forEach((w) => {
      const customName = walletNames[w];
      const walletName = getDisplayName(activeChain, w);
      wItems.push({
        value: wallets[w].address,
        index: w,
        label: customName || walletName,
      });
    });
    wItems.sort((a, b) => {
      if (!a.index || !b.index) return 0;
      return +a.index.split('-')[1] - +b.index.split('-')[1];
    });
    wItems.sort((a, b) => {
      if (!a.index || !b.index) return 0;
      return +a.index.split('-')[0] - +b.index.split('-')[0];
    });
    const sendContacts: contactsInterface[] = [];
    const contactsOptions: contactOption[] = (contacts[activeChain] ?? []).map(
      (c) => ({
        label:
          c.name ||
          new Date(c.id).toLocaleDateString() +
            ' ' +
            new Date(c.id).toLocaleTimeString(),
        value: c.address,
      }),
    );
    if (contactsOptions.length > 0) {
      sendContacts.push({ label: 'Contacts', options: contactsOptions });
    }
    sendContacts.push({
      label: t('common:my_wallets'),
      options: wItems,
    });
    setContactsItems(sendContacts);
  }, [wallets, activeChain, contacts, walletNames]);

  // Fetch paymaster pubkey + fee schedule + multisig init status.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await axios.get<{
          status: string;
          data: {
            pubkey?: string;
            message?: string;
            fees?: FeeSchedule;
          };
        }>(
          `https://${sspConfig().relay}/v1/sol/paymaster?chain=${activeChain}`,
        );
        if (cancelled) return;
        if (
          resp.data.status === 'success' &&
          resp.data.data?.pubkey &&
          resp.data.data?.fees
        ) {
          setPaymasterPubkey(resp.data.data.pubkey);
          setFeeSchedule(resp.data.data.fees);
        }
        // Don't toast on mount if the paymaster isn't ready — the relay
        // may be briefly slow or the user may have just opened the page
        // before the request completes. The submit handler surfaces a
        // clear error if it's still unavailable when they actually send.
      } catch (e) {
        if (!cancelled) {
          console.log('[SendSOL] paymaster fetch error', e);
        }
      }
    })();

    // Also check whether this is a "first real send" — drives the
    // first-vs-subsequent fee tier. First real send = multisig hasn't been
    // used yet (transaction_index === 0), regardless of whether the
    // multisig+nonce were pre-provisioned via /v1/sol/setup hours earlier.
    void (async () => {
      try {
        if (!xpubKey || !xpubWallet) return;
        if (!xpubKey.startsWith('[') || !xpubWallet.startsWith('[')) return;
        const splittedDerPath = walletInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];
        const { isFirstRealSend } = await getSolanaMultisigInitState({
          chain: activeChain,
          walletPubkeyBase58: walletPubkeys[addressIndex],
          keyPubkeyBase58: keyPubkeys[addressIndex],
        });
        if (!cancelled) setNeedsInit(isFirstRealSend);
      } catch (e) {
        if (!cancelled) console.log('[SendSOL] init-status check failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChain, walletInUse, xpubKey, xpubWallet]);

  // autoFee is the schedule-derived baseline; manual fees can tip up but
  // not below it.
  useEffect(() => {
    if (!feeSchedule) {
      setAutoFee('0');
      if (!manualFee) {
        setTxFee('0');
        form.setFieldValue('fee', '0');
      }
      return;
    }
    const baseLamports = needsInit
      ? feeSchedule.firstSendLamports
      : feeSchedule.subsequentSendLamports;
    const isSpl = !!txToken && txToken !== blockchainConfig.tokens[0].contract;
    const totalLamports =
      baseLamports + (isSpl ? feeSchedule.splFeeBumpLamports : 0);
    const feeSol = new BigNumber(totalLamports)
      .dividedBy(10 ** blockchainConfig.decimals)
      .toFixed();
    setAutoFee(feeSol);
    if (!manualFee) {
      setTxFee(feeSol);
      form.setFieldValue('fee', feeSol);
    }
  }, [feeSchedule, needsInit, txToken, manualFee]);

  // Spendable balance: vault SOL for native, vault token balance for SPL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!xpubKey?.startsWith('[') || !xpubWallet?.startsWith('[')) return;
        const splittedDerPath = walletInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];
        const vaultInfo = generateMultisigAddressSOL(
          walletPubkeys[addressIndex],
          keyPubkeys[addressIndex],
          0,
          activeChain,
        );
        const isNative =
          !txToken || txToken === blockchainConfig.tokens[0].contract;
        if (isNative) {
          const bal = await fetchAddressBalance(vaultInfo.address, activeChain);
          if (!cancelled) setSpendableBalance(bal.confirmed);
        } else {
          const tokenBalances = await fetchAddressTokenBalances(
            vaultInfo.address,
            activeChain,
            [txToken],
          );
          const tokenBal = tokenBalances.find((b) => b.contract === txToken);
          if (!cancelled) setSpendableBalance(tokenBal?.balance ?? '0');
        }
      } catch (e) {
        if (!cancelled) console.log('[SendSOL] balance fetch error', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txToken, walletInUse, activeChain, xpubKey, xpubWallet]);

  // Flag insufficient balance with a red input border.
  useEffect(() => {
    const tokenInfo = blockchainConfig.tokens
      .concat(importedTokens ?? [])
      .find((tk) => tk.contract === txToken);
    if (!tokenInfo) return;
    const isNative =
      !txToken || txToken === blockchainConfig.tokens[0].contract;
    const decimals = tokenInfo.decimals;
    const amountInBase = new BigNumber(sendingAmount || '0').multipliedBy(
      10 ** decimals,
    );
    const max = new BigNumber(spendableBalance);
    if (isNative) {
      // Native send + fee both come from vault SOL balance.
      const feeBase = new BigNumber(txFee || '0').multipliedBy(
        10 ** blockchainConfig.decimals,
      );
      setValidateStatusAmount(
        amountInBase.plus(feeBase).isGreaterThan(max) ? 'error' : 'success',
      );
    } else {
      // SPL: tokens come from token balance, fee comes from vault SOL.
      // Token balance check only — SOL fee balance is checked at submit time.
      setValidateStatusAmount(
        amountInBase.isGreaterThan(max) ? 'error' : 'success',
      );
    }
  }, [sendingAmount, spendableBalance, txFee, txToken, importedTokens]);

  // "Use Maximum" — fills amount with spendable - fee.
  useEffect(() => {
    if (!useMaximum) return;
    const tokenInfo = blockchainConfig.tokens
      .concat(importedTokens ?? [])
      .find((tk) => tk.contract === txToken);
    if (!tokenInfo) return;
    const isNative =
      !txToken || txToken === blockchainConfig.tokens[0].contract;
    const decimals = tokenInfo.decimals;
    const max = new BigNumber(spendableBalance).dividedBy(10 ** decimals);
    if (isNative) {
      const fee = new BigNumber(txFee || '0');
      const remaining = max.minus(fee);
      const value = remaining.isGreaterThan(0) ? remaining.toFixed() : '0';
      setSendingAmount(value);
      form.setFieldValue('amount', value);
    } else {
      setSendingAmount(max.toFixed());
      form.setFieldValue('amount', max.toFixed());
    }
  }, [useMaximum, spendableBalance, txFee, txToken]);

  const selectedTokenInfo = useMemo(
    () =>
      blockchainConfig.tokens
        .concat(importedTokens ?? [])
        .find((tk) => tk.contract === txToken) ?? blockchainConfig.tokens[0],
    [blockchainConfig.tokens, importedTokens, txToken],
  );

  const validateRecipient = (addr: string): boolean =>
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);

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
      if (auth) Object.assign(data, auth);
    } catch (e) {
      console.warn('[SendSOL postAction] auth unavailable', e);
    }
    return axios.post(`https://${sspConfig().relay}/v1/action`, data);
  };

  const onFinish = (values: sendForm) => {
    if (!validateRecipient(values.receiver)) {
      displayMessage('error', t('send:err_invalid_receiver'));
      return;
    }
    if (!values.amount || isNaN(+values.amount) || +values.amount <= 0) {
      displayMessage('error', t('send:input_amount'));
      return;
    }
    if (!feeSchedule || !paymasterPubkey) {
      displayMessage('error', 'Solana paymaster not ready, try again shortly');
      return;
    }
    if (!xpubKey?.startsWith('[') || !xpubWallet?.startsWith('[')) {
      displayMessage(
        'error',
        'Solana pairing not complete — partner pubkey array missing',
      );
      return;
    }

    setSubmitting(true);
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string')
          throw new Error('Password decryption failed');
        const xprivBlob = secureLocalStorage.getItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xprivBlob !== 'string')
          throw new Error('Wallet xpriv missing from secure storage');
        let xprivChain = await passworderDecrypt(password, xprivBlob);
        password = null;
        if (typeof xprivChain !== 'string')
          throw new Error('xpriv decrypt failed');

        const splittedDerPath = walletInUse.split('-');
        const addressIndex = Number(splittedDerPath[1]);
        const walletPubkeys = JSON.parse(xpubWallet) as string[];
        const keyPubkeys = JSON.parse(xpubKey) as string[];

        const keyPair = generateAddressKeypair(
          xprivChain,
          0,
          addressIndex,
          activeChain,
        );
        xprivChain = null;

        const tokenMintBase58 =
          values.asset && values.asset !== blockchainConfig.tokens[0].contract
            ? values.asset
            : undefined;
        const decimals = selectedTokenInfo.decimals;
        const baseUnits = new BigNumber(values.amount)
          .multipliedBy(10 ** decimals)
          .toFixed(0);

        // Pre-flight balance checks.
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
          if (!tokenBal || new BigNumber(tokenBal.balance).lt(baseUnits)) {
            throw new Error(
              `Insufficient ${selectedTokenInfo.symbol} balance in vault`,
            );
          }
        } else {
          const bal = await fetchAddressBalance(vaultInfo.address, activeChain);
          if (new BigNumber(bal.confirmed).lt(baseUnits)) {
            throw new Error('Insufficient SOL balance in vault');
          }
        }

        // Probe on-chain: do we need to ask the relay paymaster to set up
        // the multisig + durable nonce, and is this a first-real-send (for
        // fee tier)? Both are decoupled now: pre-setup may have happened
        // hours ago, but `isFirstRealSend` (transaction_index === 0) is
        // what determines paymaster reimbursement amount.
        const { needsSetup, isFirstRealSend } =
          await getSolanaMultisigInitState({
            chain: activeChain,
            walletPubkeyBase58: walletPubkeys[addressIndex],
            keyPubkeyBase58: keyPubkeys[addressIndex],
          });

        // If multisig and/or durable nonce missing, ask the relay paymaster
        // to atomically set both up (one paymaster-signed tx via
        // /v1/sol/setup, ~3s). This must complete before we build the send
        // tx because constructAndSignSOLTransaction assumes the nonce
        // account exists. Relay validates the vault has enough SOL to
        // reimburse the paymaster's setup costs before provisioning.
        if (needsSetup) {
          const setupRes = await axios.post<{
            status: string;
            data: {
              signature: string | null;
              multisigAddress: string;
              nonceAccount: string;
              nonceValue: string;
              alreadyProvisioned: boolean;
            };
          }>(`https://${sspConfig().relay}/v1/sol/setup`, {
            chain: activeChain,
            walletPubkey: walletPubkeys[addressIndex],
            keyPubkey: keyPubkeys[addressIndex],
          });
          if (setupRes.data?.status !== 'success') {
            throw new Error(
              `Solana vault setup failed: ${
                (setupRes.data as unknown as { data?: { message?: string } })
                  ?.data?.message ?? 'unknown error'
              }`,
            );
          }
        }

        const isSpl = !!tokenMintBase58;
        const autoLamports =
          (isFirstRealSend
            ? feeSchedule.firstSendLamports
            : feeSchedule.subsequentSendLamports) +
          (isSpl ? feeSchedule.splFeeBumpLamports : 0);
        let paymasterFeeLamports: string;
        if (manualFee) {
          const manualLamports = new BigNumber(values.fee || '0')
            .multipliedBy(10 ** blockchainConfig.decimals)
            .integerValue(BigNumber.ROUND_HALF_UP);
          if (manualLamports.lt(autoLamports)) {
            throw new Error(
              `Manual fee must be at least ${new BigNumber(autoLamports)
                .dividedBy(10 ** blockchainConfig.decimals)
                .toFixed()} ${blockchainConfig.symbol}`,
            );
          }
          paymasterFeeLamports = manualLamports.toFixed(0);
        } else {
          paymasterFeeLamports = autoLamports.toString();
        }

        const signedTxBase64 = await constructAndSignSOLTransaction({
          chain: activeChain,
          recipient: values.receiver,
          amount: baseUnits,
          walletPubkeyBase58: walletPubkeys[addressIndex],
          keyPubkeyBase58: keyPubkeys[addressIndex],
          walletPrivKeyHex: keyPair.privKey,
          paymasterPubkeyBase58: paymasterPubkey,
          paymasterFeeLamports,
          tokenMintBase58,
        });
        await postAction(
          'tx',
          signedTxBase64,
          activeChain,
          walletInUse,
          sspWalletKeyInternalIdentity,
        );
        setTxHex(signedTxBase64);
        setOpenConfirmTx(true);
        setSubmitting(false);

        // Save recipient as a contact (if not already saved + not own address).
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
            .catch((e) => console.log(e));
        }
      })
      .catch((error: Error) => {
        console.log(error);
        setSubmitting(false);
        // Close the wait-for-key modal if it was open — error supersedes it.
        setOpenConfirmTx(false);
        // Surface key-rejection vs other errors distinctly.
        if (error?.message?.includes('Key device rejected')) {
          setOpenTxRejected(true);
        } else {
          displayMessage('error', error?.message || 'Send failed');
        }
      });
  };

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
  };

  const txSentAction = (status: boolean) => {
    setOpenTxSent(status);
    setOpenConfirmTx(false);
    if (txSentInterval) clearInterval(txSentInterval);
    if (status) navigate('/home');
  };

  const txRejectedAction = (status: boolean) => {
    setOpenTxRejected(status);
    setOpenConfirmTx(false);
    if (txSentInterval) clearInterval(txSentInterval);
  };

  const cancelSend = () => {
    navigate('/home');
  };

  const refresh = () => {
    /* placeholder — Navbar has refresh disabled here */
  };

  return (
    <>
      {contextHolder}
      <Navbar refresh={refresh} hasRefresh={false} allowChainSwitch={false} />
      <Divider />
      <Form
        name="sendSolForm"
        form={form}
        onFinish={(values) => void onFinish(values)}
        autoComplete="off"
        layout="vertical"
        style={{ paddingBottom: '43px' }}
        initialValues={{
          receiver: state.receiver || '',
          amount: state.amount || '',
          asset: state.contract || blockchainConfig.tokens[0]?.contract || '',
        }}
      >
        <Form.Item name="asset" label={t('send:asset')}>
          <Select
            size="large"
            style={{ textAlign: 'left' }}
            popupMatchSelectWidth={false}
            value={txToken}
            onChange={(value) => setTxToken(value)}
            options={tokenItems}
            dropdownRender={(menu) => <>{menu}</>}
          />
        </Form.Item>

        <Form.Item
          label={t('send:receiver_address')}
          name="receiver"
          rules={[
            { required: true, message: t('send:input_receiver_address') },
          ]}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input
              size="large"
              value={txReceiver}
              placeholder={t('send:receiver_address')}
              onChange={(e) => {
                setTxReceiver(e.target.value);
                form.setFieldValue('receiver', e.target.value);
              }}
            />
            <Select
              size="large"
              className="no-text-select"
              style={{ width: '40px' }}
              defaultValue=""
              value={txReceiver}
              popupMatchSelectWidth={false}
              onChange={(value) => {
                setTxReceiver(value);
                form.setFieldValue('receiver', value);
              }}
              options={contactsItems}
              dropdownRender={(menu) => <>{menu}</>}
            />
          </Space.Compact>
        </Form.Item>

        <Form.Item
          label={t('send:amount_to_send')}
          name="amount"
          rules={[{ required: true, message: t('send:input_amount') }]}
          validateStatus={validateStatusAmount}
        >
          <Input
            size="large"
            value={sendingAmount}
            onChange={(e) => {
              setSendingAmount(e.target.value);
              setUseMaximum(false);
            }}
            placeholder={t('send:input_amount')}
            suffix={selectedTokenInfo.symbol}
          />
        </Form.Item>
        <Button
          type="text"
          size="small"
          style={{
            marginTop: '-22px',
            float: 'right',
            marginRight: 3,
            fontSize: 12,
            color: token.colorPrimary,
            cursor: 'pointer',
            zIndex: 2,
          }}
          onClick={() => setUseMaximum(true)}
        >
          {t('send:max')}:{' '}
          {new BigNumber(spendableBalance)
            .dividedBy(10 ** selectedTokenInfo.decimals)
            .toFixed()}
        </Button>

        <Form.Item
          label={t('send:max_fee')}
          name="fee"
          style={{ paddingTop: '2px' }}
        >
          <Input
            size="large"
            value={txFee}
            placeholder={t('send:max_tx_fee')}
            suffix={blockchainConfig.symbol}
            onChange={(e) => {
              setTxFee(e.target.value);
              form.setFieldValue('fee', e.target.value);
            }}
            disabled={!manualFee}
          />
        </Form.Item>
        <Button
          type="text"
          size="small"
          style={{
            marginTop: '-22px',
            float: 'left',
            marginLeft: 3,
            fontSize: 12,
            color: '#4096ff',
            cursor: 'pointer',
            zIndex: 2,
          }}
          onClick={() => {
            const next = !manualFee;
            setManualFee(next);
            if (!next) {
              setTxFee(autoFee);
              form.setFieldValue('fee', autoFee);
            }
          }}
        >
          {manualFee
            ? t('send:using_manual_fee')
            : t('send:using_automatic_fee')}
        </Button>

        <Form.Item style={{ marginTop: 50 }}>
          <Space direction="vertical" size="middle">
            <Popconfirm
              title={t('send:confirm_tx')}
              description={
                <>
                  {t('send:tx_to_sspkey')}
                  <br />
                  {t('send:double_check_tx')}
                </>
              }
              overlayStyle={{ maxWidth: 360, margin: 10 }}
              okText={t('send:send')}
              cancelText={t('common:cancel')}
              onConfirm={() => form.submit()}
              icon={
                <QuestionCircleOutlined style={{ color: token.colorSuccess }} />
              }
            >
              <Button
                type="primary"
                size="large"
                loading={submitting}
                style={{ maxWidth: '380px', overflow: 'scroll' }}
              >
                {t('send:send')}
              </Button>
            </Popconfirm>
            <Button type="link" block size="small" onClick={cancelSend}>
              {t('common:cancel')}
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <ConfirmTxKey
        open={openConfirmTx}
        openAction={confirmTxAction}
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
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default SendSOL;
