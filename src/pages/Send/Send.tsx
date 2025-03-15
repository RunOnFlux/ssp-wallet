import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Form,
  message,
  Divider,
  Button,
  Input,
  Space,
  Popconfirm,
  Popover,
  Select,
} from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import Navbar from '../../components/Navbar/Navbar';
import {
  constructAndSignTransaction,
  clearUtxoCache,
  fetchUtxos,
  getTransactionSize,
} from '../../lib/constructTx';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { sspConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../../hooks/useSocket';
import { blockchains } from '@storage/blockchains';
import { setContacts } from '../../store';

import { transaction, utxo, swapResponseData } from '../../types';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import './Send.css';

interface contactOption {
  label: string;
  index?: string;
  value: string;
}

interface contactsInterface {
  label: string;
  options: contactOption[];
}

interface sendForm {
  receiver: string;
  amount: string;
  fee: string;
  message: string;
  utxos: utxo[]; // RBF mandatory utxos - use all of them or one?
  paymentAction?: boolean;
  swap?: swapResponseData;
}

let txSentInterval: string | number | NodeJS.Timeout | undefined;
let alreadyRunning = false;

function Send() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const state = location.state as sendForm;
  const {
    txid: socketTxid,
    clearTxid,
    txRejected,
    chain: txChain,
    clearTxRejected,
  } = useSocket();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const transactions = wallets[walletInUse].transactions;
  const redeemScript = wallets[walletInUse].redeemScript;
  const witnessScript = wallets[walletInUse].witnessScript;
  const sender = wallets[walletInUse].address;
  const myNodes = wallets[walletInUse].nodes ?? [];
  const [spendableBalance, setSpendableBalance] = useState('0');
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [txid, setTxid] = useState('');
  const [sendingAmount, setSendingAmount] = useState('0');
  const [txReceiver, setTxReceiver] = useState('');
  const [txMessage, setTxMessage] = useState('');
  const [txFee, setTxFee] = useState('0');
  const [feePerByte, setFeePerByte] = useState('0');
  const [validateStatusAmount, setValidateStatusAmount] = useState<
    '' | 'success' | 'error' | 'warning' | 'validating' | undefined
  >('success');
  const [useMaximum, setUseMaximum] = useState(false);
  const [manualFee, setManualFee] = useState(false);
  const [txSizeVBytes, setTxSize] = useState(0);
  const [contactsItems, setContactsItems] = useState<contactsInterface[]>([]);
  const { networkFees } = useAppSelector((state) => state.networkFees);
  const { contacts } = useAppSelector((state) => state.contacts);

  const blockchainConfig = blockchains[activeChain];
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const browser = window.chrome || window.browser;

  useEffect(() => {
    try {
      if (state.amount || state.receiver || state.message) {
        console.log('TRIGGERED A');
        setFeePerByte(networkFees[activeChain].base.toFixed());
        obtainFreshUtxos();
        if (state.amount) {
          setSendingAmount(state.amount);
          form.setFieldValue('amount', state.amount);
        }
        if (state.receiver) {
          setTxReceiver(state.receiver);
          form.setFieldValue('receiver', state.receiver);
        }
        if (state.message) {
          setTxMessage(state.message);
          form.setFieldValue('message', state.message);
        }
      }
    } catch (error) {
      console.log(error);
    }
  }, [state.message, state.receiver, state.amount]);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    try {
      if (!state.amount && !state.receiver && !state.message) {
        console.log('TRIGGERED B');
        setFeePerByte(networkFees[activeChain].base.toFixed());
        obtainFreshUtxos();
      }
    } catch (error) {
      console.log(error);
    }
  });

  useEffect(() => {
    const wItems: contactOption[] = [];
    Object.keys(wallets).forEach((wallet) => {
      const typeNumber = Number(wallet.split('-')[0]);
      const walletNumber = Number(wallet.split('-')[1]) + 1;
      let walletName = `${t('common:wallet')} ${walletNumber.toString()}`;
      if (typeNumber === 1) {
        walletName = `${t('common:change')} ${walletNumber.toString()}`;
      }
      const wal = {
        value: wallets[wallet].address,
        index: wallet,
        label: t('home:navbar.chain_wallet', {
          chain: blockchainConfig.name,
          wallet: walletName,
        }),
      };
      wItems.push(wal);
    });
    wItems.sort((a, b) => {
      if (!a.index || !b.index) return 0;
      if (+a.index.split('-')[1] < +b.index.split('-')[1]) return -1;
      if (+a.index.split('-')[1] > +b.index.split('-')[1]) return 1;
      return 0;
    });
    wItems.sort((a, b) => {
      if (!a.index || !b.index) return 0;
      if (+a.index.split('-')[0] < +b.index.split('-')[0]) return -1;
      if (+a.index.split('-')[0] > +b.index.split('-')[0]) return 1;
      return 0;
    });
    const sendContacts = [];
    const contactsOptions: contactOption[] = [];
    contacts[activeChain]?.forEach((contact) => {
      const option = {
        label:
          contact.name ||
          new Date(contact.id).toLocaleDateString() +
            ' ' +
            new Date(contact.id).toLocaleTimeString(),
        value: contact.address,
      };
      contactsOptions.push(option);
    });
    if (contactsOptions.length > 0) {
      sendContacts.push({
        label: 'Contacts',
        options: contactsOptions,
      });
    }
    sendContacts.push({
      label: 'My Wallets',
      options: wItems,
    });
    setContactsItems(sendContacts);
  }, [wallets, activeChain]);

  // on every chain, address adjustment, fetch utxos
  // used to get a precise estimate of the tx size
  useEffect(() => {
    if (alreadyRunning) return;
    alreadyRunning = true;
    fetchUtxos(sender, activeChain, state.utxos?.length ? 1 : 0) // this should always be cached, use confirmed in case of RBF
      .then(async (utxos) => {
        getSpendableBalance(utxos);
        await calculateTxFeeSize();
        alreadyRunning = false;
      })
      .catch((error) => {
        alreadyRunning = false;
        console.log(error);
        if (!manualFee) {
          // reset fee
          setFeePerByte(networkFees[activeChain].base.toFixed());
          setTxFee('0');
          form.setFieldValue('fee', '');
        } else {
          // set fee per byte to 0
          setFeePerByte('---');
        }
      });
  }, [walletInUse, activeChain, sendingAmount, manualFee]);

  useEffect(() => {
    if (useMaximum && !manualFee) {
      return;
    }
    fetchUtxos(sender, activeChain, state.utxos?.length ? 1 : 0) // this should always be cached. Use confirmed mode if RBF flag
      .then(async (utxos) => {
        getSpendableBalance(utxos);
        await calculateTxFeeSize();
      })
      .catch((error) => {
        console.log(error);
        if (!manualFee) {
          // reset fee
          setFeePerByte(networkFees[activeChain].base.toFixed());
          setTxFee('0');
          form.setFieldValue('fee', '');
        } else {
          // set fee per byte to 0
          setFeePerByte('---');
        }
      });
  }, [txFee]);

  useEffect(() => {
    const totalAmount = new BigNumber(sendingAmount).plus(txFee || '0');
    const maxSpendable = new BigNumber(spendableBalance).dividedBy(
      10 ** blockchainConfig.decimals,
    );
    if (totalAmount.isGreaterThan(maxSpendable)) {
      // mark amount in red box as bad inpout
      setValidateStatusAmount('error');
    } else {
      setValidateStatusAmount('success');
    }
  }, [walletInUse, activeChain, sendingAmount, txFee]);

  useEffect(() => {
    if (useMaximum) {
      const maxSpendable = new BigNumber(spendableBalance).dividedBy(
        10 ** blockchainConfig.decimals,
      );
      const fee = new BigNumber(txFee || '0');
      setSendingAmount(
        maxSpendable.minus(fee).isGreaterThan(0)
          ? maxSpendable.minus(fee).toFixed()
          : '0',
      );
      form.setFieldValue(
        'amount',
        maxSpendable.minus(fee).isGreaterThan(0)
          ? maxSpendable.minus(fee).toFixed()
          : '0',
      );
    }
  }, [useMaximum, txFee, spendableBalance]);

  useEffect(() => {
    if (txid) {
      setOpenConfirmTx(false);
      setTimeout(() => {
        if (state.paymentAction) {
          payRequestAction({
            status: 'SUCCESS', // do not translate
            data: t('home:payment_request.transaction_sent'),
            txid,
          });
        }
        setOpenTxSent(true);
      });
    }
  }, [txid]);

  useEffect(() => {
    if (socketTxid) {
      setTxid(socketTxid);
      clearTxid?.();
      // stop interval
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
      obtainFreshUtxos();
    }
  }, [socketTxid]);

  useEffect(() => {
    if (txRejected) {
      setOpenConfirmTx(false);
      setTimeout(() => {
        if (state.paymentAction) {
          payRequestAction(null);
        }
        setOpenTxRejected(true);
      });
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
      clearTxRejected?.();
    }
  }, [txRejected]);

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const confirmTxAction = (status: boolean) => {
    setOpenConfirmTx(status);
    if (status === false) {
      // stop refreshing
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
    }
  };
  const txSentAction = (status: boolean) => {
    setOpenTxSent(status);
    if (status === false) {
      // all ok, navigate back to home
      navigate('/home');
    }
  };

  const txRejectedAction = (status: boolean) => {
    setOpenTxRejected(status);
  };

  const getSpendableBalance = (utxos: utxo[]) => {
    // get spendable balance
    const correctUtxos = utxos.filter(
      (utxo) =>
        utxo.coinbase !== true ||
        (utxo.coinbase === true &&
          utxo.confirmations &&
          utxo.confirmations > 100),
    );
    let utxoAmountSats = new BigNumber(0);
    correctUtxos.forEach((utxo) => {
      utxoAmountSats = utxoAmountSats.plus(utxo.satoshis);
    });
    let spAmount = utxoAmountSats.toFixed();
    myNodes.forEach((node) => {
      if (node.name) {
        // if utxo is present in utxo list remove it from spendable balance
        if (
          correctUtxos.find(
            (utxo) => utxo.txid === node.txid && utxo.vout === node.vout,
          )
        ) {
          spAmount = new BigNumber(spAmount).minus(node.amount).toFixed();
        }
      }
    });
    setSpendableBalance(spAmount);
  };

  const obtainFreshUtxos = () => {
    clearUtxoCache();
    fetchUtxos(sender, activeChain, state.utxos?.length ? 1 : 0) // use confirmed only in case of RBF
      .then((utxos) => {
        getSpendableBalance(utxos);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const calculateTxFeeSize = async () => {
    if (!manualFee) {
      setFeePerByte(networkFees[activeChain].base.toFixed());
    }
    // this method should be more light and not require private key.
    // get size estimate
    console.log('tx size estimation');
    // get our password to decrypt xpriv from secure storage
    const fingerprint: string = getFingerprint();
    let password = await passworderDecrypt(fingerprint, passwordBlob);
    if (typeof password !== 'string') {
      throw new Error(t('send:err_pwd_not_valid'));
    }
    const xprivBlob = secureLocalStorage.getItem(
      `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
        blockchainConfig.scriptType,
      )}-${blockchainConfig.id}`,
    );
    if (typeof xprivBlob !== 'string') {
      throw new Error(t('send:err_invalid_xpriv'));
    }
    let xprivChain = await passworderDecrypt(password, xprivBlob);
    // reassign password to null as it is no longer needed
    password = null;
    if (typeof xprivChain !== 'string') {
      throw new Error(t('send:err_invalid_xpriv_decrypt'));
    }
    const wInUse = walletInUse;
    const splittedDerPath = wInUse.split('-');
    const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
    const addressIndex = Number(splittedDerPath[1]);
    const keyPair = generateAddressKeypair(
      xprivChain,
      typeIndex,
      addressIndex,
      activeChain,
    );
    // reassign xprivChain to null as it is no longer needed
    xprivChain = null;
    const amount = new BigNumber(sendingAmount || '0')
      .multipliedBy(10 ** blockchainConfig.decimals)
      .toFixed();
    const fee = new BigNumber(txFee || '0')
      .multipliedBy(10 ** blockchainConfig.decimals)
      .toFixed();
    const lockedUtxos = myNodes.filter((node) => node.name);
    // maxFee is max 100USD worth in fee
    const cr = cryptoRates[activeChain] ?? 0;
    const fiUSD = fiatRates.USD ?? 0;
    const fiatPriceUSD = cr * fiUSD;
    const maxFeeUSD = sspConfig().maxTxFeeUSD; // max USD fee per tranasction
    const maxFeeUNIT = new BigNumber(maxFeeUSD)
      .dividedBy(fiatPriceUSD)
      .toFixed();
    const maxFeeSat = new BigNumber(maxFeeUNIT)
      .multipliedBy(10 ** blockchainConfig.decimals)
      .toFixed();
    const txSize = await getTransactionSize(
      activeChain,
      txReceiver || sender, // estimate as if we are sending to ourselves
      amount,
      fee,
      sender,
      sender,
      txMessage || '',
      keyPair.privKey,
      redeemScript,
      witnessScript,
      maxFeeSat,
      lockedUtxos,
      state.utxos,
    );
    // target recommended fee of blockchain config
    setTxSize(txSize);
    const fpb =
      feePerByte === '---'
        ? networkFees[activeChain].base.toFixed()
        : feePerByte;
    const feeSats = new BigNumber(txSize)
      .multipliedBy(manualFee ? fpb : networkFees[activeChain].base.toFixed())
      .toFixed(); // satoshis
    console.log(feeSats);
    console.log(fpb);
    const feeUnit = new BigNumber(feeSats)
      .dividedBy(10 ** blockchainConfig.decimals)
      .toFixed(); // unit
    console.log(feeUnit);
    // if the difference is less than 20 satoshis, ignore.
    if (
      feeUnit !== txFee &&
      new BigNumber(feeSats)
        .minus(
          new BigNumber(txFee || '0').multipliedBy(
            10 ** blockchainConfig.decimals,
          ),
        )
        .abs()
        .gt(20)
    ) {
      if (!manualFee) {
        setFeePerByte(networkFees[activeChain].base.toFixed());
        form.setFieldValue('fee', feeUnit);
        setTxFee(feeUnit);
      } else {
        // set fee per byte
        // whats the fee per byte?
        const fpb = new BigNumber(fee).dividedBy(txSize).toFixed(2);
        setFeePerByte(fpb);
      }
    }
  };

  const postAction = (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
    utxos: utxo[],
  ) => {
    const data = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
      utxos,
    };
    axios
      .post(`https://${sspConfig().relay}/v1/action`, data)
      .then((res) => {
        console.log(res);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const onFinish = (values: sendForm) => {
    console.log(values);
    if (values.receiver.length < 8) {
      displayMessage('error', t('send:err_invalid_receiver'));
      return;
    }
    if (!values.amount || +values.amount <= 0 || isNaN(+values.amount)) {
      displayMessage('error', t('send:err_invalid_amount'));
      return;
    }
    if (!values.fee || +values.fee < 0 || isNaN(+values.fee)) {
      displayMessage('error', t('send:err_invalid_fee'));
      return;
    }
    if (+txSizeVBytes >= blockchainConfig.maxTxSize) {
      displayMessage('error', t('send:err_tx_size_limit'));
      return;
    }
    if (values.message && values.message.length > blockchainConfig.maxMessage) {
      displayMessage(
        'error',
        t('send:err_invalid_message', {
          characters: blockchainConfig.maxMessage,
        }),
      );
      return;
    }
    // get our password to decrypt xpriv from secure storage
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string') {
          throw new Error(t('send:err_pwd_not_valid'));
        }
        const xprivBlob = secureLocalStorage.getItem(
          `xpriv-48-${blockchainConfig.slip}-0-${getScriptType(
            blockchainConfig.scriptType,
          )}-${blockchainConfig.id}`,
        );
        if (typeof xprivBlob !== 'string') {
          throw new Error(t('send:err_invalid_xpriv'));
        }
        let xprivChain = await passworderDecrypt(password, xprivBlob);
        // reassign password to null as it is no longer needed
        password = null;
        if (typeof xprivChain !== 'string') {
          throw new Error(t('send:err_invalid_xpriv_decrypt'));
        }
        const wInUse = walletInUse;
        const splittedDerPath = wInUse.split('-');
        const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
        const addressIndex = Number(splittedDerPath[1]);
        const keyPair = generateAddressKeypair(
          xprivChain,
          typeIndex,
          addressIndex,
          activeChain,
        );
        // reassign xprivChain to null as it is no longer needed
        xprivChain = null;
        const amount = new BigNumber(values.amount)
          .multipliedBy(10 ** blockchainConfig.decimals)
          .toFixed();
        const fee = new BigNumber(values.fee)
          .multipliedBy(10 ** blockchainConfig.decimals)
          .toFixed();
        const lockedUtxos = myNodes.filter((node) => node.name);
        // maxFee is max 100USD worth in fee
        const cr = cryptoRates[activeChain] ?? 0;
        const fiUSD = fiatRates.USD ?? 0;
        const fiatPriceUSD = cr * fiUSD;
        const maxFeeUSD = sspConfig().maxTxFeeUSD; // max USD fee per tranasction
        const maxFeeUNIT = new BigNumber(maxFeeUSD)
          .dividedBy(fiatPriceUSD)
          .toFixed();
        const maxFeeSat = new BigNumber(maxFeeUNIT)
          .multipliedBy(10 ** blockchainConfig.decimals)
          .toFixed();
        constructAndSignTransaction(
          activeChain,
          values.receiver,
          amount,
          fee,
          sender,
          sender,
          values.message,
          keyPair.privKey,
          redeemScript,
          witnessScript,
          maxFeeSat,
          lockedUtxos,
          state.utxos,
        )
          .then((txInfo) => {
            console.log(txInfo);
            // post to ssp relay
            postAction(
              'tx',
              txInfo.signedTx,
              activeChain,
              wInUse,
              sspWalletKeyInternalIdentity,
              txInfo.utxos,
            );
            setTxHex(txInfo.signedTx);
            setOpenConfirmTx(true);
            if (txSentInterval) {
              clearInterval(txSentInterval);
            }
            txSentInterval = setInterval(() => {
              fetchTransactions();
            }, 5000);
            // construction was successful, save receier to contacts
            const contactExists = contacts[activeChain]?.find(
              (contact) => contact.address === values.receiver,
            );
            const myAddresses: string[] = [];
            Object.keys(wallets).forEach((wallet) => {
              myAddresses.push(wallets[wallet].address);
            });

            if (!contactExists && !myAddresses.includes(values.receiver)) {
              const newContact = {
                id: new Date().getTime(),
                name: '', // save as empty string which will force date to be shown
                address: values.receiver,
              };
              const adjContacts = [];
              contacts[activeChain]?.forEach((contact) => {
                adjContacts.push(contact);
              });
              adjContacts.push(newContact);
              const completeContacts = {
                ...contacts,
                [activeChain]: adjContacts,
              };
              dispatch(setContacts(completeContacts));
              void (async function () {
                try {
                  await localForage.setItem('contacts', completeContacts);
                } catch (error) {
                  console.log(error);
                }
              })();
            }
          })
          .catch((error: TypeError) => {
            displayMessage('error', error.message);
            console.log(error);
          });
      })
      .catch((error) => {
        console.log(error);
        displayMessage('error', t('send:err_s1'));
      });

    const fetchTransactions = () => {
      fetchAddressTransactions(sender, activeChain, 0, 3, 1)
        .then((txs) => {
          const amount = new BigNumber(0)
            .minus(
              new BigNumber(values.amount).multipliedBy(
                10 ** blockchainConfig.decimals,
              ),
            )
            .toFixed();
          // amount must be the same and not present in our transactions table
          txs.forEach((tx) => {
            if (tx.amount === amount) {
              const txExists = transactions.find(
                (ttx: transaction) => ttx.txid === tx.txid,
              );
              if (!txExists) {
                setTxid(tx.txid);
                // stop interval
                if (txSentInterval) {
                  clearInterval(txSentInterval);
                }
                obtainFreshUtxos();
              }
            }
          });
        })
        .catch((error) => {
          console.log(error);
        });
    };
  };

  interface paymentData {
    status: string;
    txid?: string;
    data?: string;
  }

  const payRequestAction = (data: paymentData | null) => {
    console.log(data);
    if (browser?.runtime?.sendMessage) {
      // we do not use sendResponse, instead we are sending new message
      if (!data) {
        // reject message
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: 'ERROR', // do not translate
            result: t('common:request_rejected'),
          },
        });
      } else {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data,
        });
      }
    } else {
      console.log('no browser or chrome runtime.sendMessage');
    }
  };

  const cancelSend = () => {
    if (state.paymentAction) {
      payRequestAction(null);
    }
    navigate('/home');
  };

  const content = (
    <div>
      <p>{t('home:transactionsTable.replace_by_fee_desc')}</p>
      <p>{t('home:transactionsTable.replace_by_fee_desc_b')}</p>
      <p>{t('send:replace_by_fee_stop')}</p>
    </div>
  );

  const refresh = () => {
    console.log(
      'just a placeholder, navbar has refresh disabled but refresh is required to be passed',
    );
  };

  return (
    <>
      {contextHolder}
      <Navbar
        refresh={refresh}
        hasRefresh={false}
        allowChainSwitch={false}
        header={state.swap ? t('home:swap.swap_crypto') : ''}
      />
      <Divider />
      <Form
        name="sendForm"
        form={form}
        onFinish={(values) => void onFinish(values as sendForm)}
        autoComplete="off"
        layout="vertical"
        itemRef="txFeeRef"
        style={{
          paddingBottom: '43px',
          marginTop: state.swap ? '24px' : '0',
        }}
      >
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
              disabled={!!state.swap}
              onChange={(e) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                setTxReceiver(e.target.value),
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
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                setTxReceiver(value), form.setFieldValue('receiver', value);
              }}
              options={contactsItems}
              disabled={!!state.swap}
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
            suffix={blockchainConfig.symbol}
            disabled={!!state.swap}
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
            color: '#4096ff',
            cursor: state.swap ? 'not-allowed' : 'pointer',
            zIndex: 2,
          }}
          onClick={() => setUseMaximum(true)}
          disabled={!!state.swap}
        >
          {t('send:max')}:{' '}
          {new BigNumber(spendableBalance)
            .dividedBy(10 ** blockchainConfig.decimals)
            .toFixed()}
        </Button>
        <Form.Item
          style={{
            marginTop: '26px',
          }}
          label={t('send:message')}
          name="message"
          rules={[{ required: false, message: t('send:include_message') }]}
        >
          <Input
            size="large"
            value={txMessage}
            placeholder={t('send:payment_note')}
            onChange={(e) => setTxMessage(e.target.value)}
          />
        </Form.Item>

        <Form.Item
          label={t('send:fee')}
          name="fee"
          rules={[{ required: true, message: t('send:input_fee') }]}
        >
          <Input
            size="large"
            value={txFee}
            placeholder={t('send:tx_fee')}
            suffix={blockchainConfig.symbol}
            onChange={(e) => setTxFee(e.target.value)}
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
            setManualFee(!manualFee);
          }}
        >
          {manualFee
            ? t('send:using_manual_fee')
            : t('send:using_automatic_fee')}
        </Button>
        <div
          style={{
            marginTop: '-22px',
            float: 'right',
            marginRight: 10,
            fontSize: 12,
            color: 'grey',
          }}
        >
          {feePerByte}{' '}
          {blockchainConfig.scriptType === 'p2sh' ? 'sat/B' : 'sat/vB'}
        </div>

        <Form.Item style={{ marginTop: 50 }}>
          <Space direction="vertical" size="middle">
            {state.utxos?.length && (
              <div
                style={{
                  fontSize: 12,
                  color: 'grey',
                }}
              >
                <Popover content={content} title={t('send:replace_by_fee_tx')}>
                  <QuestionCircleOutlined style={{ color: 'blue' }} />{' '}
                </Popover>{' '}
                {t('send:replace_by_fee_tx')}
              </div>
            )}
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
              onConfirm={() => {
                form.submit();
              }}
              icon={<QuestionCircleOutlined style={{ color: 'green' }} />}
            >
              <Button
                type="primary"
                size="large"
                style={{ maxWidth: '380px', overflow: 'scroll' }}
              >
                {state.swap
                  ? t('send:send_swap', {
                      buyAsset: state.swap.buyAsset,
                      buyAmount: new BigNumber(state.swap.buyAmount).toFixed(),
                    })
                  : t('send:send')}
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
        txid={txid}
        chain={txChain}
      />
      <TxRejected open={openTxRejected} openAction={txRejectedAction} />
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default Send;
