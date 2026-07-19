/**
 * UTXO send strategy hook — the stateful half of the strategy.
 *
 * ALL state, effects, fee-size estimation and the onFinish submit handler
 * are lifted from the legacy src/pages/Send/Send.tsx (deleted with this
 * unification). Transaction construction still goes through the unchanged
 * lib/constructTx functions (fetchUtxos, getTransactionSize,
 * constructAndSignTransaction) with identical inputs — invariant 1.
 *
 * The only adaptation: the automatic fee rate can be one of three presets
 * (slow/normal/fast) derived from the same relay base rate; "normal" is
 * bit-identical to the legacy automatic mode and "custom" is the legacy
 * manual mode (user edits the total fee, sat/vB is derived).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from '../../lib/toast';
import { useNavigate, useLocation } from 'react-router';
import { Form, Input } from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import {
  constructAndSignTransaction,
  clearUtxoCache,
  fetchUtxos,
  getTransactionSize,
} from '../../lib/constructTx';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { generateAddressKeypair, getScriptType } from '../../lib/wallet';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import { fetchAddressTransactions } from '../../lib/transactions';
import { validateReceiverAddress } from '../../lib/addressValidation';
import { formatFiatWithSymbol } from '../../lib/currency';
import { sspConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../../hooks/useSocket';
import { blockchains } from '@storage/blockchains';
import { setContacts } from '../../store';
import { transaction, utxo, swapResponseData } from '../../types';
import {
  presetRateUtxo,
  utxoFeeForRate,
  type FeePresetKey,
} from '../../lib/sendStrategies/utxo';
import type { SendStrategyView, FeePresetView } from './types';

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

export function useUtxoSendStrategy(): SendStrategyView {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const state = (location.state ?? {}) as sendForm;
  const {
    txid: socketTxid,
    clearTxid,
    txRejected,
    chain: txChain,
    clearTxRejected,
  } = useSocket();
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { createWkIdentityAuth } = useRelayAuth();
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
  const [feePreset, setFeePreset] = useState<FeePresetKey>('normal');
  // txFee starts at '0' which is indistinguishable from a real computed fee —
  // this flag flips true only once calculateTxFeeSize actually completed, so
  // the review Send button is not enabled on a not-yet-estimated fee.
  const [feeComputed, setFeeComputed] = useState(false);
  const [txSizeVBytes, setTxSize] = useState(0);
  const { networkFees } = useAppSelector((state) => state.networkFees);
  const { contacts } = useAppSelector((state) => state.contacts);

  const blockchainConfig = blockchains[activeChain];
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const browser = window.chrome || window.browser;

  // "custom" preset === the legacy manual-fee mode; slow/normal/fast are the
  // automatic mode with the rate derived from the same relay base rate.
  const manualFee = feePreset === 'custom';
  const autoRate = presetRateUtxo(
    feePreset === 'custom' ? 'normal' : feePreset,
    networkFees[activeChain].base,
  );

  useEffect(() => {
    try {
      if (state.amount || state.receiver || state.message) {
        setFeePerByte(autoRate);
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
    try {
      if (!state.amount && !state.receiver && !state.message) {
        setFeePerByte(autoRate);
        obtainFreshUtxos();
      }
    } catch (error) {
      console.log(error);
    }
  }, []);

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
          // reset fee — estimation failed, the '0' shown is NOT a real fee
          setFeeComputed(false);
          setFeePerByte(autoRate);
          setTxFee('0');
          form.setFieldValue('fee', '');
        } else {
          // set fee per byte to 0
          setFeePerByte('---');
        }
      });
  }, [walletInUse, activeChain, sendingAmount, manualFee, feePreset]);

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
          // reset fee — estimation failed, the '0' shown is NOT a real fee
          setFeeComputed(false);
          setFeePerByte(autoRate);
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
    void toast.open({
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
      setFeePerByte(autoRate);
    }
    // this method should be more light and not require private key.
    // get size estimate
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
    const maxFeeSat = BigNumber.min(
      new BigNumber(maxFeeUNIT).multipliedBy(10 ** blockchainConfig.decimals),
      new BigNumber(blockchainConfig.maxFee),
    ).toFixed();
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
    const fpb = feePerByte === '---' ? autoRate : feePerByte;
    const feeSats = new BigNumber(txSize)
      .multipliedBy(manualFee ? fpb : autoRate)
      .toFixed(); // satoshis
    let feeUnit = new BigNumber(feeSats)
      .dividedBy(10 ** blockchainConfig.decimals)
      .toFixed(); // unit

    if (state.swap && state.fee) {
      const swapFee = new BigNumber(state.fee);
      const calculatedFee = new BigNumber(feeUnit);
      if (swapFee.isGreaterThan(calculatedFee)) {
        feeUnit = swapFee.toFixed();
      }
    }

    // if the difference is less than 20 satoshis, ignore.
    if (
      feeUnit !== txFee &&
      new BigNumber(feeUnit)
        .multipliedBy(10 ** blockchainConfig.decimals)
        .minus(
          new BigNumber(txFee || '0').multipliedBy(
            10 ** blockchainConfig.decimals,
          ),
        )
        .abs()
        .gt(20)
    ) {
      if (!manualFee) {
        setFeePerByte(autoRate);
        form.setFieldValue('fee', feeUnit);
        setTxFee(feeUnit);
      } else {
        // set fee per byte
        // whats the fee per byte?
        const fpb = new BigNumber(fee).dividedBy(txSize).toFixed(2);
        setFeePerByte(fpb);
      }
    }
    // estimation completed — whatever txFee now holds is a real fee (a
    // computed zero is legitimate on effectively-free chains)
    setFeeComputed(true);
  };

  const postAction = async (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
    utxos: utxo[],
  ) => {
    const data: Record<string, unknown> = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
      utxos,
    };

    // Add authentication if available (includes hash of request body)
    try {
      const auth = await createWkIdentityAuth('action', wkIdentity, data);
      if (auth) {
        Object.assign(data, auth);
      }
    } catch (error) {
      console.warn(
        '[postAction] Auth not available, sending without signature',
        error,
      );
    }

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
    const receiverValidation = validateReceiverAddress(
      values.receiver,
      activeChain,
    );
    if (!receiverValidation.valid) {
      if (receiverValidation.warningChainType) {
        displayMessage(
          'error',
          t('send:err_wrong_chain_address', {
            chain: blockchainConfig.name,
          }),
        );
      } else {
        displayMessage('error', t('send:err_invalid_receiver'));
      }
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
        const maxFeeSat = BigNumber.min(
          new BigNumber(maxFeeUNIT).multipliedBy(
            10 ** blockchainConfig.decimals,
          ),
          new BigNumber(blockchainConfig.maxFee),
        ).toFixed();
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
      if (!data) {
        void browser.runtime.sendMessage({
          origin: 'ssp',
          data: {
            status: 'ERROR',
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

  // Inline, chain-aware receiver-address validation for live feedback. Empty
  // input is treated as neutral so we don't show an error before the user types.
  const receiverValidation = txReceiver.trim()
    ? validateReceiverAddress(txReceiver, activeChain)
    : { valid: true };
  const showReceiverError =
    !!txReceiver.trim() && !receiverValidation.valid && !state.swap;

  // Live fiat estimate under the amount field, using the same rate path as the
  // balance display (crypto rate * fiat rate).
  const toFiat = (units: string | null): string | null => {
    if (units === null) {
      return null;
    }
    const numeric = new BigNumber(units || '0');
    if (!numeric.isFinite() || numeric.lte(0)) {
      return null;
    }
    const cr = cryptoRates[activeChain] ?? 0;
    const fi = fiatRates[sspConfig().fiatCurrency] ?? 0;
    if (!cr || !fi) {
      return null;
    }
    return formatFiatWithSymbol(numeric.multipliedBy(cr).multipliedBy(fi));
  };

  // Pre-submit gate for compose → review (same checks onFinish re-runs).
  const validateCompose = (): string | null => {
    const rv = validateReceiverAddress(txReceiver, activeChain);
    if (!rv.valid) {
      return rv.warningChainType
        ? t('send:err_wrong_chain_address', { chain: blockchainConfig.name })
        : t('send:err_invalid_receiver');
    }
    if (!sendingAmount || +sendingAmount <= 0 || isNaN(+sendingAmount)) {
      return t('send:err_invalid_amount');
    }
    if (txMessage && txMessage.length > blockchainConfig.maxMessage) {
      return t('send:err_invalid_message', {
        characters: blockchainConfig.maxMessage,
      });
    }
    return null;
  };

  const feePresets: FeePresetView[] = useMemo(() => {
    const base = networkFees[activeChain].base;
    return [
      // Automatic = the relay's recommended rate (the legacy "automatic" fee);
      // Custom = the manual field. Slow/Fast presets dropped — SSP chains have
      // little fee-market spread and the extra tiles read as noise.
      {
        key: 'normal' as const,
        feeAmount: utxoFeeForRate(
          txSizeVBytes,
          presetRateUtxo('normal', base),
          blockchainConfig.decimals,
        ),
      },
      { key: 'custom' as const, feeAmount: txFee || null },
    ];
  }, [
    networkFees,
    activeChain,
    txSizeVBytes,
    blockchainConfig.decimals,
    txFee,
  ]);

  const totalDisplay = new BigNumber(sendingAmount || '0')
    .plus(txFee || '0')
    .toFixed();

  // Legacy manual-fee inputs: total fee in coin units + derived sat/vB
  // readout — exactly the fields the old Send page exposed in manual mode.
  // The Form.Item stays mounted across presets (SendFlow hides it) so the
  // 'fee' form value survives.
  const customFeeContent = (
    <>
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
      <div
        style={{
          marginTop: '-20px',
          textAlign: 'right',
          marginRight: 10,
          fontSize: 12,
          opacity: 0.65,
        }}
      >
        {feePerByte}{' '}
        {blockchainConfig.scriptType === 'p2sh' ? 'sat/B' : 'sat/vB'}
      </div>
    </>
  );

  const modals = (
    <>
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
    </>
  );

  return {
    chainType: 'utxo',
    headerTitle: state.swap ? t('home:swap.swap_crypto') : '',
    submitLabel: state.swap
      ? t('send:send_swap', {
          buyAsset: state.swap.buyAsset,
          buyAmount: new BigNumber(state.swap.buyAmount).toFixed(),
        })
      : t('send:send'),
    form,
    onFinish: (values) => onFinish(values as sendForm),
    cancel: cancelSend,
    submitting: false,
    tokenSelect: null,
    receiver: {
      value: txReceiver,
      set: (value: string) => {
        setTxReceiver(value);
        form.setFieldValue('receiver', value);
      },
      disabled: !!state.swap,
      valid: !!txReceiver.trim() && receiverValidation.valid,
      showError: showReceiverError,
      errorText: showReceiverError
        ? receiverValidation.warningChainType
          ? t('send:err_wrong_chain_address', {
              chain: blockchainConfig.name,
            })
          : t('send:err_invalid_receiver')
        : null,
      qrEnabled: !state.swap,
    },
    amount: {
      value: sendingAmount,
      set: (value: string) => {
        setSendingAmount(value);
        setUseMaximum(false);
      },
      status: validateStatusAmount,
      suffix: blockchainConfig.symbol,
      disabled: !!state.swap,
      fiat: toFiat(sendingAmount),
      maxDisplay: new BigNumber(spendableBalance)
        .dividedBy(10 ** blockchainConfig.decimals)
        .toFixed(),
      onMax: () => setUseMaximum(true),
      maxDisabled: !!state.swap,
    },
    message: { value: txMessage, set: setTxMessage },
    composeExtra: null,
    validateCompose,
    feePresets,
    selectedPreset: feePreset,
    selectPreset: setFeePreset,
    customFeeContent,
    hiddenFormContent: null,
    feeDisplay: txFee || '---',
    // Custom preset = the user's own fee; otherwise require a completed
    // estimation (txFee inits to '0' which is not a real fee).
    feeReady: manualFee || feeComputed,
    feeSymbol: blockchainConfig.symbol,
    feeFiat: toFiat(txFee),
    feeRateDisplay:
      feePerByte && feePerByte !== '---'
        ? `${feePerByte} ${
            blockchainConfig.scriptType === 'p2sh' ? 'sat/B' : 'sat/vB'
          }`
        : null,
    totalDisplay,
    isRBF: !!state.utxos?.length,
    approveActive: openConfirmTx,
    modals,
  };
}
