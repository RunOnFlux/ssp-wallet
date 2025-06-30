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
  Collapse,
} from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import Navbar from '../../components/Navbar/Navbar';
import {
  constructAndSignEVMTransaction,
  estimateGas,
} from '../../lib/constructTx';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import {
  setBalance,
  setUnconfirmedBalance,
  setTokenBalances,
  setActivatedTokens,
} from '../../store';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import {
  generateAddressKeypair,
  getScriptType,
  deriveEVMPublicKey,
} from '../../lib/wallet';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';
import ConfirmPublicNoncesKey from '../../components/ConfirmPublicNoncesKey/ConfirmPublicNoncesKey.tsx';
import PublicNoncesRejected from '../../components/PublicNoncesRejected/PublicNoncesRejected';
import PublicNoncesReceived from '../../components/PublicNoncesReceived/PublicNoncesReceived';
import { fetchAddressTransactions } from '../../lib/transactions.ts';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances.ts';
import {
  QuestionCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { sspConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../../hooks/useSocket';
import { blockchains } from '@storage/blockchains';
import { setContacts } from '../../store';
import { useWalletConnect } from '../../contexts/WalletConnectContext';

import {
  transaction,
  utxo,
  tokenBalanceEVM,
  swapResponseData,
} from '../../types';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import SspConnect from '../../components/SspConnect/SspConnect.tsx';
import './SendEVM.css';
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

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

interface sendForm {
  receiver: string;
  amount: string;
  fee: string;
  message: string;
  utxos: utxo[]; // RBF mandatory utxos - use all of them or one?
  contract: string;
  paymentAction?: boolean;
  swap?: swapResponseData;
  baseGasPrice?: string;
  priorityGasPrice?: string;
  totalGasLimit?: string;
  data?: string;
  walletConnectTxId?: string;
  walletConnectMode?: boolean;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

let txSentInterval: string | number | NodeJS.Timeout | undefined;

function SendEVM() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const state = location.state as sendForm;
  const {
    txid: socketTxid,
    clearTxid,
    txRejected,
    chain: txChain,
    clearTxRejected,
    publicNonces,
    publicNoncesRejected,
    clearPublicNonces,
    clearPublicNoncesRejected,
  } = useSocket();
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { xpubKey, wallets, walletInUse, importedTokens } = useAppSelector(
    (state) => state[activeChain],
  );
  const transactions = wallets[walletInUse].transactions;
  const sender = wallets[walletInUse].address;
  const [spendableBalance, setSpendableBalance] = useState('0');
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [openConfirmPublicNonces, setOpenConfirmPublicNonces] = useState(false);
  const [openPublicNoncesRejected, setOpenPublicNoncesRejected] =
    useState(false);
  const [openPublicNoncsReceived, setOpenPublicNoncesReceived] =
    useState(false);
  const [txHex, setTxHex] = useState('');
  const [txid, setTxid] = useState('');
  const [sendingAmount, setSendingAmount] = useState('0');
  const [txReceiver, setTxReceiver] = useState('');
  const [txToken, setTxToken] = useState('');
  const blockchainConfig = blockchains[activeChain];
  const [txFee, setTxFee] = useState('0');
  const [txData, setTxData] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showFeeDetails, setShowFeeDetails] = useState(false);
  const [baseGasPrice, setBaseGasPrice] = useState(
    blockchainConfig.baseFee.toString(),
  );
  const [priorityGasPrice, setPriorityGasPrice] = useState(
    blockchainConfig.priorityFee.toString(),
  );
  const [totalGasLimit, setTotalGasLimit] = useState(
    blockchainConfig.gasLimit.toString(),
  );
  const [validateStatusAmount, setValidateStatusAmount] = useState<
    '' | 'success' | 'error' | 'warning' | 'validating' | undefined
  >('success');
  const [useMaximum, setUseMaximum] = useState(false);
  const [manualFee, setManualFee] = useState(false);
  const [contactsItems, setContactsItems] = useState<contactsInterface[]>([]);
  const [tokenItems, setTokenItems] = useState<tokenOption[]>([]);
  const { networkFees } = useAppSelector((state) => state.networkFees);
  const { contacts } = useAppSelector((state) => state.contacts);

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const browser = window.chrome || window.browser;
  const { handleWalletConnectTxCompletion, handleWalletConnectTxRejection } =
    useWalletConnect();

  // Handle WalletConnect parameters from navigation state
  useEffect(() => {
    if (state?.walletConnectMode) {
      console.log(
        '🔗 SendEVM: WalletConnect mode detected, setting parameters',
      );

      // Set the WalletConnect mode flag in form values
      form.setFieldValue('walletConnectMode', true);

      // Apply gas settings if provided
      if (state.baseGasPrice) {
        setBaseGasPrice(state.baseGasPrice);
        form.setFieldValue('base_gas_price', state.baseGasPrice);
      }

      if (state.priorityGasPrice) {
        setPriorityGasPrice(state.priorityGasPrice);
        form.setFieldValue('priority_gas_price', state.priorityGasPrice);
      }

      if (state.totalGasLimit) {
        setTotalGasLimit(state.totalGasLimit);
        form.setFieldValue('total_gas_limit', state.totalGasLimit);
      }

      // Calculate fee with the new values
      calculateTxFee();
    }
  }, [
    state?.walletConnectMode,
    state?.baseGasPrice,
    state?.priorityGasPrice,
    state?.totalGasLimit,
  ]);

  useEffect(() => {
    try {
      if (state.amount) {
        setSendingAmount(state.amount);
        form.setFieldValue('amount', state.amount);
      }
      if (state.receiver) {
        setTxReceiver(state.receiver);
        form.setFieldValue('receiver', state.receiver);
      }
      if (state.data) {
        setTxData(state.data);
        form.setFieldValue('data', state.data);
        setShowAdvancedOptions(true); // Show advanced options if data is provided
      }
    } catch (error) {
      console.log(error);
    }
  }, [state.receiver, state.amount, state.data]);

  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    setBaseGasPrice(networkFees[activeChain].base.toString());
    setPriorityGasPrice(networkFees[activeChain].priority!.toString());
    setTotalGasLimit(blockchainConfig.gasLimit.toString());
    form.setFieldValue(
      'base_gas_price',
      networkFees[activeChain].base.toString(),
    );
    form.setFieldValue(
      'priority_gas_price',
      networkFees[activeChain].priority!.toString(),
    );
    form.setFieldValue('total_gas_limit', blockchainConfig.gasLimit.toString());
    void getTotalGasLimit();
    const totalGas = new BigNumber(blockchainConfig.gasLimit.toString()); // get better estimation
    const totalGasPrice = new BigNumber(
      networkFees[activeChain].base.toString(),
    ).plus(networkFees[activeChain].priority!.toString());
    const totalFee = totalGas.multipliedBy(totalGasPrice);
    const totalFeeETH = totalFee.dividedBy(10 ** 18).toFixed();
    if (totalFeeETH === 'NaN') {
      setTxFee('---');
      form.setFieldValue('fee', '---');
      return;
    }
    setTxFee(totalFeeETH);
    form.setFieldValue('fee', totalFeeETH);
  });

  useEffect(() => {
    getSpendableBalance();
  }, [txToken]);

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

  useEffect(() => {
    // only use activated tokens
    const activatedTokens = (
      wallets[walletInUse].activatedTokens || []
    ).slice();
    // add first coin (ethereum) as that is always activated
    activatedTokens.push(blockchainConfig.tokens[0].contract);
    // tokens with imported tokens
    const allTokens = blockchainConfig.tokens.concat(importedTokens ?? []);
    if (state.contract) {
      // find if the contract exists in the tokens array
      const token = allTokens.find(
        (token) => token.contract === state.contract,
      );
      // if the token is not in our activatedTokens and it is a token supported, add it to tokens array
      if (token && !activatedTokens.includes(state.contract)) {
        activatedTokens.push(state.contract);
        // save to localforage
        const tokensToSave = activatedTokens.filter(
          (token) => token !== blockchainConfig.tokens[0].contract,
        );
        setActivatedTokens(activeChain, walletInUse, tokensToSave || []);
        void (async function () {
          await localForage.setItem(
            `activated-tokens-${activeChain}-${walletInUse}`,
            tokensToSave,
          );
        })();
      }
    }
    const tokens = allTokens.filter((token) =>
      activatedTokens.includes(token.contract),
    );
    const tokenItems: tokenOption[] = [];
    tokens.forEach((token) => {
      const option = {
        label: token.name + ' (' + token.symbol + ')',
        value: token.contract,
      };
      tokenItems.push(option);
    });
    setTokenItems(tokenItems);
    if (state.contract) {
      // find if the contract exists in the tokens array
      const token = tokens.find((token) => token.contract === state.contract);
      if (token) {
        setTxToken(token.contract);
        form.setFieldValue('asset', token.contract);
      }
    } else {
      setTxToken(blockchainConfig.tokens[0].contract); // default ETH
      form.setFieldValue('asset', blockchainConfig.tokens[0].contract);
    }
  }, [activeChain, state.contract]);

  // on every chain, address adjustment, fetch utxos
  // used to get a precise estimate of the tx size
  useEffect(() => {
    refreshAutomaticFee();
    getSpendableBalance();
    void getTotalGasLimit();
  }, [networkFees, walletInUse, activeChain, manualFee, txToken, txData]);

  useEffect(() => {
    form.setFieldValue('base_gas_price', baseGasPrice);
    form.setFieldValue('priority_gas_price', priorityGasPrice);
    form.setFieldValue('total_gas_limit', totalGasLimit);
    calculateTxFee();
  }, [baseGasPrice, priorityGasPrice, totalGasLimit, manualFee]);

  useEffect(() => {
    if (txToken) {
      const tokenInformation = blockchains[activeChain].tokens
        .concat(importedTokens ?? [])
        .find((token) => {
          return token.contract === txToken;
        });
      if (!tokenInformation) {
        setValidateStatusAmount('error');
        return;
      }
      const totalAmount = new BigNumber(sendingAmount);
      const maxSpendable = new BigNumber(spendableBalance).dividedBy(
        10 ** tokenInformation.decimals,
      );
      if (totalAmount.isGreaterThan(maxSpendable)) {
        // mark amount in red box as bad inpout
        setValidateStatusAmount('error');
      } else {
        setValidateStatusAmount('success');
      }
    } else {
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
    }
  }, [walletInUse, activeChain, sendingAmount, txFee, spendableBalance]);

  useEffect(() => {
    if (useMaximum) {
      if (txToken) {
        const tokenInformation = blockchains[activeChain].tokens
          .concat(importedTokens ?? [])
          .find((token) => {
            return token.contract === txToken;
          });
        if (!tokenInformation) {
          setSendingAmount('0');
          form.setFieldValue('amount', '0');
        } else {
          const spendableDecimals = new BigNumber(spendableBalance).dividedBy(
            10 ** tokenInformation.decimals,
          );
          setSendingAmount(spendableDecimals.toFixed());
          form.setFieldValue('amount', spendableDecimals.toFixed());
        }
        return;
      }
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

      // Handle WalletConnect completion if in WalletConnect mode
      if (state.walletConnectMode && state.walletConnectTxId) {
        console.log(
          '🔗 SendEVM: WalletConnect transaction completed, txid:',
          socketTxid,
        );
        handleWalletConnectTxCompletion(socketTxid);
      }

      // stop interval
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
    }
  }, [socketTxid]);

  useEffect(() => {
    if (publicNonces) {
      setOpenConfirmPublicNonces(false);
      // save to storage
      const sspKeyPublicNonces = JSON.parse(publicNonces) as publicNonces[];
      void (async function () {
        try {
          await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
          setOpenPublicNoncesReceived(true);
        } catch (error) {
          console.log(error);
        }
      })();

      clearPublicNonces?.();
    }
  }, [publicNonces]);

  useEffect(() => {
    if (txRejected) {
      setOpenConfirmTx(false);
      setTimeout(() => {
        if (state.paymentAction) {
          payRequestAction(null);
        }

        // Handle WalletConnect rejection if in WalletConnect mode
        if (state.walletConnectMode && state.walletConnectTxId) {
          console.log(
            '🔗 SendEVM: WalletConnect transaction rejected on SSP key',
          );
          handleWalletConnectTxRejection(
            'Transaction rejected by SSP key device',
          );
        }

        setOpenTxRejected(true);
      });
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
      clearTxRejected?.();
    }
  }, [txRejected]);

  useEffect(() => {
    if (publicNoncesRejected) {
      setOpenConfirmPublicNonces(false);
      setTimeout(() => {
        // Handle WalletConnect rejection if public nonces are rejected
        if (state.walletConnectMode && state.walletConnectTxId) {
          console.log(
            '🔗 SendEVM: WalletConnect transaction failed - public nonces rejected',
          );
          handleWalletConnectTxRejection(
            'Public nonces rejected by SSP key device',
          );
        }

        setOpenPublicNoncesRejected(true);
      });
      clearPublicNoncesRejected?.();
    }
  }, [publicNoncesRejected]);

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

  const confirmPublicNoncesAction = (status: boolean) => {
    setOpenConfirmPublicNonces(status);
  };

  const publicNoncesRejectedAction = (status: boolean) => {
    setOpenPublicNoncesRejected(status);
  };

  const publicNoncesReceivedAction = (status: boolean) => {
    setOpenPublicNoncesReceived(status);
  };

  const refreshAutomaticFee = () => {
    if (!manualFee) {
      // reset fee
      setBaseGasPrice(networkFees[activeChain].base.toString());
      setPriorityGasPrice(networkFees[activeChain].priority!.toString());
      setTotalGasLimit(blockchainConfig.gasLimit.toString());
    }
  };

  const getSpendableBalance = () => {
    void (async function () {
      try {
        const balancesWallet: balancesObj | null = await localForage.getItem(
          `balances-${activeChain}-${walletInUse}`,
        );
        const balancesTokens: tokenBalanceEVM[] | null =
          await localForage.getItem(
            `token-balances-${activeChain}-${walletInUse}`,
          );
        if (txToken) {
          if (balancesTokens?.length) {
            const tokenBalExists = balancesTokens.find(
              (token) => token.contract === txToken,
            );
            if (tokenBalExists) {
              setSpendableBalance(tokenBalExists.balance);
            } else {
              setSpendableBalance('0');
            }
          } else {
            fetchBalance();
          }
        } else if (balancesWallet) {
          setSpendableBalance(balancesWallet.confirmed);
        } else {
          fetchBalance();
        }
      } catch (error) {
        console.log(error);
      }
    })();
  };

  const fetchBalance = () => {
    const chainFetched = activeChain;
    const walletFetched = walletInUse;
    fetchAddressBalance(wallets[walletFetched].address, chainFetched)
      .then(async (balance) => {
        if (!txToken) {
          setSpendableBalance(balance.confirmed);
        }
        setBalance(chainFetched, walletFetched, balance.confirmed);
        setUnconfirmedBalance(chainFetched, walletFetched, balance.unconfirmed);
        await localForage.setItem(
          `balances-${chainFetched}-${walletFetched}`,
          balance,
        );
      })
      .catch((error) => {
        console.log(error);
      });

    // only fetch for evm chainType
    if (blockchains[chainFetched].chainType === 'evm') {
      // create contracts array from tokens contracts in specs
      const tokens = blockchains[chainFetched].tokens
        .concat(importedTokens ?? [])
        .map((token) => token.contract);
      fetchAddressTokenBalances(
        wallets[walletFetched].address, // todo evaluate only activated contracts
        chainFetched,
        tokens,
      )
        .then(async (balancesTokens) => {
          console.log(balancesTokens);
          setTokenBalances(chainFetched, walletFetched, balancesTokens);
          await localForage.setItem(
            `token-balances-${chainFetched}-${walletFetched}`,
            balancesTokens,
          );
          if (txToken) {
            if (balancesTokens?.length) {
              const tokenBalExists = balancesTokens.find(
                (token) => token.contract === txToken,
              );
              if (tokenBalExists) {
                setSpendableBalance(tokenBalExists.balance);
              } else {
                setSpendableBalance('0');
              }
            }
          }
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  const getTotalGasLimit = async () => {
    const token = txToken;
    const gasLimit = await estimateGas(activeChain, sender, token, txData);
    setTotalGasLimit(gasLimit);
  };

  const calculateTxFee = () => {
    // here how much gas our transaction will use by maximum?
    // here we set the overall gas limit and calculate the ETH value

    const totalGas = new BigNumber(totalGasLimit); // get better estimation
    const totalGasPrice = new BigNumber(baseGasPrice)
      .plus(priorityGasPrice)
      .multipliedBy(10 ** 9);
    const totalFee = totalGas.multipliedBy(totalGasPrice);
    const totalFeeETH = totalFee.dividedBy(10 ** 18).toFixed();
    if (totalFeeETH === 'NaN') {
      setTxFee('---');
      form.setFieldValue('fee', '---');
      return;
    }
    setTxFee(totalFeeETH);
    form.setFieldValue('fee', totalFeeETH);
  };

  const postAction = (
    action: string,
    payload: string,
    chain: string,
    path: string,
    wkIdentity: string,
  ) => {
    const data = {
      action,
      payload,
      chain,
      path,
      wkIdentity,
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
    console.log('🔗 SendEVM onFinish values:', values);
    console.log('🔗 SendEVM walletConnectMode:', values.walletConnectMode);
    console.log('🔗 SendEVM amount:', values.amount, 'parsed:', +values.amount);

    if (values.receiver.length < 8 || !values.receiver.startsWith('0x')) {
      displayMessage('error', t('send:err_invalid_receiver'));
      return;
    }
    // For WalletConnect transactions, allow 0 value (smart contract interactions)
    // For regular transactions, require amount > 0
    if (!values.amount || isNaN(+values.amount)) {
      displayMessage('error', t('send:err_invalid_amount'));
      return;
    }
    if (!values.walletConnectMode && +values.amount <= 0) {
      displayMessage('error', t('send:err_invalid_amount'));
      return;
    }

    if (!values.fee || +values.fee < 0 || isNaN(+values.fee)) {
      displayMessage('error', t('send:err_invalid_fee'));
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
        const publicKey2HEX = deriveEVMPublicKey(
          xpubKey,
          typeIndex,
          addressIndex,
          activeChain,
        ); // ssp key
        const sspKeyPublicNonces: publicNonces[] =
          (await localForage.getItem('sspKeyPublicNonces')) ?? []; // an array of [{kPublic, kTwoPublic}...]
        if (!sspKeyPublicNonces.length) {
          setOpenConfirmPublicNonces(true);
          // ask for the nonces
          postAction(
            'publicnoncesrequest',
            '[]',
            activeChain,
            '',
            sspWalletKeyInternalIdentity,
          );
          throw new Error(t('send:err_public_nonces'));
        }
        // choose random nonce
        const pos = Math.floor(Math.random() * (sspKeyPublicNonces.length + 1));
        const publicNoncesSSP = sspKeyPublicNonces[pos];
        // delete the nonce from the array
        sspKeyPublicNonces.splice(pos, 1);
        // save the array back to storage
        await localForage.setItem('sspKeyPublicNonces', sspKeyPublicNonces);
        const amount = new BigNumber(values.amount).toFixed();
        constructAndSignEVMTransaction(
          activeChain,
          values.receiver as `0x${string}`,
          amount,
          keyPair.privKey as `0x${string}`,
          publicKey2HEX,
          publicNoncesSSP,
          baseGasPrice,
          priorityGasPrice,
          totalGasLimit,
          txToken as `0x${string}` | '',
          importedTokens,
          values.data, // Use form data instead of state.data
        )
          .then((signedTx) => {
            console.log(signedTx);
            // post to ssp relay
            postAction(
              'tx',
              signedTx,
              activeChain,
              wInUse,
              sspWalletKeyInternalIdentity,
            );
            setTxHex(signedTx);
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
      .catch((error: TypeError) => {
        console.log(error);
        displayMessage('error', error.message ?? t('send:err_s1'));
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

    // Handle WalletConnect rejection if user cancels transaction
    if (state.walletConnectMode && state.walletConnectTxId) {
      console.log('🔗 SendEVM: User cancelled WalletConnect transaction');
      handleWalletConnectTxRejection('Transaction cancelled by user');
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

  // Helper function to decode transaction data
  const decodeTransactionData = (data: string): string => {
    if (!data || data === '0x') return '';

    // Common function signatures
    const functionSignatures: Record<string, string> = {
      '0xa9059cbb': 'ERC20 Transfer',
      '0x23b872dd': 'ERC20 TransferFrom',
      '0x095ea7b3': 'ERC20 Approve',
      '0x40c10f19': 'ERC20 Mint',
      '0x42842e0e': 'NFT Safe Transfer',
      '0xa22cb465': 'NFT Set Approval For All',
      '0x70a08231': 'ERC20 Balance Of',
    };

    const signature = data.substring(0, 10);
    const functionName = functionSignatures[signature];

    if (functionName) {
      return `${functionName} (${signature})`;
    }

    return `Contract Call (${signature})`;
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
        {/* Hidden field for WalletConnect mode flag */}
        <Form.Item name="walletConnectMode" style={{ display: 'none' }}>
          <Input type="hidden" />
        </Form.Item>

        <Form.Item name="asset" label={t('send:asset')}>
          <Select
            size="large"
            style={{ textAlign: 'left' }}
            defaultValue={
              blockchainConfig.name + ' (' + blockchainConfig.symbol + ')'
            }
            popupMatchSelectWidth={false}
            value={txToken}
            onChange={(value) => {
              setTxToken(value);
            }}
            options={tokenItems}
            disabled={!!state.swap}
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
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                setTxReceiver(e.target.value),
                  form.setFieldValue('receiver', e.target.value);
              }}
              disabled={!!(state?.walletConnectMode && state?.receiver)}
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
              disabled={!!(state?.walletConnectMode && state?.receiver)}
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
            suffix={
              blockchainConfig.tokens
                .concat(importedTokens ?? [])
                .find((t) => t.contract === txToken)?.symbol ??
              blockchainConfig.symbol
            }
            disabled={
              !!state.swap || !!(state?.walletConnectMode && state?.amount)
            }
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
            cursor:
              !!state.swap || !!(state?.walletConnectMode && state?.amount)
                ? 'not-allowed'
                : 'pointer',
            zIndex: 2,
          }}
          onClick={() => setUseMaximum(true)}
          disabled={
            !!state.swap || !!(state?.walletConnectMode && state?.amount)
          }
        >
          {t('send:max')}:{' '}
          {new BigNumber(spendableBalance)
            .dividedBy(
              10 **
                (blockchainConfig.tokens
                  .concat(importedTokens ?? [])
                  .find((t) => t.contract === txToken)?.decimals ??
                  blockchainConfig.decimals),
            )
            .toFixed()}
        </Button>
        <Form.Item
          label={t('send:max_fee')}
          name="fee"
          style={{ paddingTop: '2px' }}
          rules={[{ required: true, message: t('send:invalid_tx_fee') }]}
        >
          <Input
            size="large"
            value={txFee}
            placeholder={t('send:max_tx_fee')}
            suffix={blockchainConfig.symbol}
            onChange={(e) => setTxFee(e.target.value)}
            disabled={true}
          />
        </Form.Item>
        <Collapse
          size="small"
          style={{ marginTop: '-20px', textAlign: 'left' }}
          activeKey={[
            ...(showAdvancedOptions || (state?.data && txData) ? ['2'] : []),
            ...(showFeeDetails ? ['1'] : []),
          ]}
          onChange={(keys: string[] | string) => {
            const keysArray = Array.isArray(keys) ? keys : [keys];
            setShowAdvancedOptions(keysArray.includes('2'));
            setShowFeeDetails(keysArray.includes('1'));
          }}
          items={[
            {
              key: '1',
              label: t('send:fee_details'),
              children: (
                <div>
                  <Form.Item
                    label={t('send:base_gas_price')}
                    name="base_gas_price"
                    rules={[
                      { required: true, message: t('send:input_gas_price') },
                    ]}
                  >
                    <Input
                      size="large"
                      value={baseGasPrice}
                      placeholder={t('send:input_gas_price')}
                      suffix="gwei"
                      onChange={(e) => setBaseGasPrice(e.target.value)}
                      disabled={!manualFee}
                    />
                  </Form.Item>
                  <Form.Item
                    label={t('send:priority_gas_price')}
                    name="priority_gas_price"
                    rules={[
                      {
                        required: true,
                        message: t('send:input_priority_gas_price'),
                      },
                    ]}
                  >
                    <Input
                      size="large"
                      value={priorityGasPrice}
                      placeholder={t('send:input_priority_gas_price')}
                      suffix="gwei"
                      onChange={(e) => setPriorityGasPrice(e.target.value)}
                      disabled={!manualFee}
                    />
                  </Form.Item>
                  <Form.Item
                    label={t('send:total_gas_limit')}
                    name="total_gas_limit"
                    rules={[
                      { required: true, message: t('send:input_gas_limit') },
                    ]}
                  >
                    <Input
                      size="large"
                      value={totalGasLimit}
                      placeholder={t('send:input_gas_limit')}
                      suffix="gas"
                      onChange={(e) => setTotalGasLimit(e.target.value)}
                      disabled={!manualFee}
                    />
                  </Form.Item>
                  <div style={{ textAlign: 'center', marginTop: '-10px' }}>
                    <Button
                      type="link"
                      size="small"
                      style={{
                        fontSize: 12,
                      }}
                      onClick={() => {
                        setManualFee(!manualFee);
                      }}
                    >
                      {manualFee
                        ? t('send:using_manual_fee')
                        : t('send:using_automatic_fee')}
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: '2',
              label: t('send:advanced_options'),
              children: (
                <div style={{ textAlign: 'left' }}>
                  <Form.Item
                    label={
                      <span>
                        {t('send:transaction_data')}
                        {state.walletConnectMode && state.data && (
                          <span
                            style={{
                              color: '#1890ff',
                              fontSize: '12px',
                              marginLeft: '8px',
                            }}
                          >
                            {t('send:data_from_dapp')}
                          </span>
                        )}
                      </span>
                    }
                    name="data"
                    rules={[
                      {
                        validator: (_, value: string) => {
                          if (!value || value === '') return Promise.resolve();
                          if (
                            !value.startsWith('0x') ||
                            !/^0x[0-9a-fA-F]*$/.test(value)
                          ) {
                            return Promise.reject(
                              new Error(t('send:err_invalid_hex_data')),
                            );
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <Input.TextArea
                      size="large"
                      value={txData}
                      placeholder={t('send:transaction_data_placeholder')}
                      onChange={(e) => {
                        setTxData(e.target.value);
                        form.setFieldValue('data', e.target.value);
                      }}
                      disabled={
                        Boolean(state?.walletConnectMode && state?.data) ||
                        Boolean(
                          txToken &&
                            txToken !== blockchainConfig.tokens[0].contract,
                        )
                      }
                      rows={3}
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </Form.Item>
                  {txData && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#666',
                        marginTop: '-15px',
                        marginBottom: '15px',
                        textAlign: 'left',
                      }}
                    >
                      {t('send:contract_interaction')}:{' '}
                      {decodeTransactionData(txData)}
                    </div>
                  )}
                  {txToken &&
                    txToken !== blockchainConfig.tokens[0].contract && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#faad14',
                          marginTop: '-10px',
                          marginBottom: '15px',
                          padding: '8px',
                          backgroundColor: '#fffbe6',
                          border: '1px solid #ffe58f',
                          borderRadius: '4px',
                          textAlign: 'left',
                        }}
                      >
                        <ExclamationCircleOutlined
                          style={{ marginRight: '4px' }}
                        />
                        {t('send:warn_data_only_eth', {
                          symbol: blockchainConfig.symbol,
                        })}
                      </div>
                    )}
                  {txData && txData.startsWith('0xa9059cbb') && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#faad14',
                        marginTop: '-10px',
                        marginBottom: '15px',
                        padding: '8px',
                        backgroundColor: '#fffbe6',
                        border: '1px solid #ffe58f',
                        borderRadius: '4px',
                        textAlign: 'left',
                      }}
                    >
                      <ExclamationCircleOutlined
                        style={{ marginRight: '4px' }}
                      />
                      {t('send:warn_token_transfer_override')}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />

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
      <ConfirmPublicNoncesKey
        open={openConfirmPublicNonces}
        openAction={confirmPublicNoncesAction}
      />
      <PublicNoncesRejected
        open={openPublicNoncesRejected}
        openAction={publicNoncesRejectedAction}
      />
      <PublicNoncesReceived
        open={openPublicNoncsReceived}
        openAction={publicNoncesReceivedAction}
      />
      <SspConnect />
      <PoweredByFlux />
    </>
  );
}

export default SendEVM;
