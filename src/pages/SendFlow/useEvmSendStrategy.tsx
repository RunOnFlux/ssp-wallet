/**
 * EVM send strategy hook — the stateful half of the strategy.
 *
 * ALL state, effects, gas estimation, WalletConnect integration, public-nonce
 * handling and the onFinish submit handler are lifted from the legacy
 * src/pages/SendEVM/SendEVM.tsx (deleted with this unification). Transaction
 * construction still goes through the unchanged lib/constructTx functions
 * (estimateGas, constructAndSignEVMTransaction) with identical inputs —
 * invariant 1.
 *
 * The only adaptation: the automatic fee can be one of three presets
 * (slow/normal/fast) that vary the priority tip over the same relay fee data;
 * "normal" is bit-identical to the legacy automatic mode and "custom" is the
 * legacy manual mode exposing the exact same five gas inputs.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from '../../lib/toast';
import { useNavigate, useLocation } from 'react-router';
import { Form, Input, Divider, Collapse, Tooltip, Alert, theme } from 'antd';
import localForage from 'localforage';
import { NoticeType } from 'antd/es/message/interface';
import {
  constructAndSignEVMTransaction,
  estimateGas,
} from '../../lib/constructTx';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { useRelayAuth } from '../../hooks/useRelayAuth';
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
import ConfirmPublicNoncesKey from '../../components/ConfirmPublicNoncesKey/ConfirmPublicNoncesKey';
import PublicNoncesRejected from '../../components/PublicNoncesRejected/PublicNoncesRejected';
import PublicNoncesReceived from '../../components/PublicNoncesReceived/PublicNoncesReceived';
import { fetchAddressTransactions } from '../../lib/transactions';
import {
  fetchAddressBalance,
  fetchAddressTokenBalances,
} from '../../lib/balances';
import { validateReceiverAddress } from '../../lib/addressValidation';
import { formatFiatWithSymbol } from '../../lib/currency';
import { CircleHelp as CircleHelpIcon } from 'lucide-react';
import { sspConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../../hooks/useSocket';
import { blockchains } from '@storage/blockchains';
import { setContacts } from '../../store';
import { useWalletConnect } from '../../contexts/WalletConnectContext';
import {
  transaction,
  utxo,
  swapResponseData,
  tokenBalanceEVM,
} from '../../types';
import { presetGasEvm, evmFeeTotalEth } from '../../lib/sendStrategies/evm';
import type { FeePresetKey } from '../../lib/sendStrategies/utxo';
import type { SendStrategyView, FeePresetView } from './types';

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
  // Individual gas components (total is calculated from these)
  preVerificationGas?: string;
  callGasLimit?: string;
  verificationGasLimit?: string;
  data?: string;
  walletConnectTxId?: string;
  walletConnectMode?: boolean;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

interface publicNonces {
  kPublic: string;
  kTwoPublic: string;
}

interface tokenOption {
  label: string;
  value: string;
}

let txSentInterval: string | number | NodeJS.Timeout | undefined;

export function useEvmSendStrategy(): SendStrategyView {
  const { token } = theme.useToken();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const state = (location.state ?? {}) as sendForm;
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
  const { t } = useTranslation(['send', 'common', 'home']);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { activeChain, sspWalletKeyInternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );
  const { createWkIdentityAuth } = useRelayAuth();
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
  const [baseGasPrice, setBaseGasPrice] = useState(
    blockchainConfig.baseFee.toString(),
  );
  const [priorityGasPrice, setPriorityGasPrice] = useState(
    blockchainConfig.priorityFee.toString(),
  );

  // Individual gas component states for detailed breakdown
  const [preVerificationGas, setPreVerificationGas] = useState('0');
  const [callGasLimit, setCallGasLimit] = useState('0');
  const [verificationGasLimit, setVerificationGasLimit] = useState('0');
  const [validateStatusAmount, setValidateStatusAmount] = useState<
    '' | 'success' | 'error' | 'warning' | 'validating' | undefined
  >('success');
  const [useMaximum, setUseMaximum] = useState(false);
  const [feePreset, setFeePreset] = useState<FeePresetKey>('normal');
  const [tokenItems, setTokenItems] = useState<tokenOption[]>([]);
  const { networkFees } = useAppSelector((state) => state.networkFees);
  const { contacts } = useAppSelector((state) => state.contacts);
  const { cryptoRates, fiatRates } = useAppSelector(
    (state) => state.fiatCryptoRates,
  );

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const browser = window.chrome || window.browser;
  const { handleWalletConnectTxCompletion, handleWalletConnectTxRejection } =
    useWalletConnect();

  // "custom" preset === the legacy manual-fee mode; slow/normal/fast are the
  // automatic mode with the priority tip derived from the same relay data.
  const manualFee = feePreset === 'custom';

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

      // Handle individual gas components from navigation state (e.g., WalletConnect)
      if (
        state.preVerificationGas &&
        state.callGasLimit &&
        state.verificationGasLimit
      ) {
        setPreVerificationGas(state.preVerificationGas);
        setCallGasLimit(state.callGasLimit);
        setVerificationGasLimit(state.verificationGasLimit);
        form.setFieldValue('preverification_gas', state.preVerificationGas);
        form.setFieldValue('call_gas_limit', state.callGasLimit);
        form.setFieldValue(
          'verification_gas_limit',
          state.verificationGasLimit,
        );
        // Calculate total from components
      } else {
        // No individual components provided, estimate them
        void getTotalGasLimit();
      }

      // Calculate fee with the new values
      calculateTxFee();
    }
  }, [state?.walletConnectMode, state?.baseGasPrice, state?.priorityGasPrice]);

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
    const chainFees = networkFees[activeChain];
    const baseFee = chainFees?.base ?? blockchainConfig.baseFee;
    const priorityFee = chainFees?.priority ?? blockchainConfig.priorityFee;

    setBaseGasPrice(baseFee.toString());
    setPriorityGasPrice(priorityFee.toString());
    // Initial gas breakdown will be calculated by getTotalGasLimit in useEffect
    form.setFieldValue('base_gas_price', baseFee.toString());
    form.setFieldValue('priority_gas_price', priorityFee.toString());

    void getTotalGasLimit();
    const totalGas = new BigNumber(blockchainConfig.gasLimit.toString()); // get better estimation
    const totalGasPrice = new BigNumber(baseFee.toString()).plus(
      priorityFee.toString(),
    );
    const totalFee = totalGas.multipliedBy(totalGasPrice);
    const totalFeeETH = totalFee.dividedBy(10 ** 18).toFixed();
    if (totalFee.isNaN() || !totalFeeETH) {
      setTxFee('---');
      form.setFieldValue('fee', '---');
      return;
    }
    setTxFee(totalFeeETH);
    form.setFieldValue('fee', totalFeeETH);
  }, []);

  useEffect(() => {
    getSpendableBalance();
  }, [txToken]);

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

  // on every chain, address adjustment, refresh fees + balances
  useEffect(() => {
    refreshAutomaticFee();
    getSpendableBalance();
    void getTotalGasLimit();
  }, [
    networkFees,
    walletInUse,
    activeChain,
    manualFee,
    feePreset,
    txToken,
    txData,
  ]);

  useEffect(() => {
    form.setFieldValue('base_gas_price', baseGasPrice);
    form.setFieldValue('priority_gas_price', priorityGasPrice);
    void getTotalGasLimit(); // Re-estimate gas when gas prices or transaction data change
    calculateTxFee();
  }, [baseGasPrice, priorityGasPrice, manualFee, txToken, txData]);

  // Always recalculate when gas components change
  useEffect(() => {
    calculateTxFee();
  }, [
    preVerificationGas,
    callGasLimit,
    verificationGasLimit,
    baseGasPrice,
    priorityGasPrice,
  ]);

  // Helper function to get total gas from components
  const getTotalGasFromComponents = () => {
    return (
      Number(preVerificationGas) +
      Number(callGasLimit) +
      Number(verificationGasLimit)
    );
  };

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
      // reset fee with safe fallbacks; the priority tip is scaled by the
      // selected preset (normal = 1x, exactly the legacy automatic fee)
      const chainFees = networkFees[activeChain];
      const baseFee = chainFees?.base ?? blockchainConfig.baseFee;
      const priorityFee = chainFees?.priority ?? blockchainConfig.priorityFee;
      // manualFee (=== feePreset 'custom') is false here, so feePreset is
      // narrowed to slow | normal | fast
      const presetGas = presetGasEvm(feePreset, baseFee, priorityFee);
      setBaseGasPrice(presetGas.base);
      setPriorityGasPrice(presetGas.priority);
      // Gas components will be recalculated by getTotalGasLimit
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
    // Don't auto-update gas limits when manual fee is enabled
    if (manualFee) {
      return;
    }

    try {
      const gasEstimate = await estimateGas(
        activeChain,
        sender,
        txToken,
        txData,
      );

      // Use the estimation results for AA overhead components
      setPreVerificationGas(gasEstimate.preVerificationGas);
      setVerificationGasLimit(gasEstimate.verificationGasLimit);

      // For callGasLimit, use WalletConnect value if provided, otherwise use estimate
      if (state?.walletConnectMode && state.callGasLimit) {
        console.log(
          `🔗 WalletConnect: Using dApp-provided callGasLimit: ${state.callGasLimit} (estimated: ${gasEstimate.callGasLimit})`,
        );
        setCallGasLimit(state.callGasLimit);
        form.setFieldValue('call_gas_limit', state.callGasLimit);
      } else {
        setCallGasLimit(gasEstimate.callGasLimit);
        form.setFieldValue('call_gas_limit', gasEstimate.callGasLimit);
      }

      // Update form fields for AA overhead components
      form.setFieldValue('preverification_gas', gasEstimate.preVerificationGas);
      form.setFieldValue(
        'verification_gas_limit',
        gasEstimate.verificationGasLimit,
      );

      console.log('💰 Gas estimation completed:', {
        preVerificationGas: gasEstimate.preVerificationGas,
        callGasLimit:
          state?.walletConnectMode && state.callGasLimit
            ? `${state.callGasLimit} (from WalletConnect)`
            : gasEstimate.callGasLimit,
        verificationGasLimit: gasEstimate.verificationGasLimit,
      });
    } catch (error) {
      console.error('Gas estimation failed:', error);
      // Fallback to default values if estimation fails
      setPreVerificationGas('90000');

      // Use WalletConnect callGasLimit if available, otherwise fallback
      if (state?.walletConnectMode && state.callGasLimit) {
        console.log(
          `🔗 WalletConnect: Using dApp-provided callGasLimit despite estimation failure: ${state.callGasLimit}`,
        );
        setCallGasLimit(state.callGasLimit);
      } else {
        setCallGasLimit('89000');
      }

      setVerificationGasLimit('550000');
    }
  };

  const calculateTxFee = () => {
    const totalGas = new BigNumber(getTotalGasFromComponents().toString());
    const totalGasPrice = new BigNumber(baseGasPrice)
      .plus(priorityGasPrice)
      .multipliedBy(10 ** 9);
    const totalFee = totalGas.multipliedBy(totalGasPrice);
    const totalFeeETH = totalFee.dividedBy(10 ** 18).toFixed();

    if (totalFee.isNaN() || !totalFeeETH) {
      setTxFee('---');
      form.setFieldValue('fee', '---');
      return;
    }

    setTxFee(totalFeeETH);
    form.setFieldValue('fee', totalFeeETH);
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
        const sspKeyPublicNoncesStorage: publicNonces[] =
          (await localForage.getItem('sspKeyPublicNonces')) ?? []; // an array of [{kPublic, kTwoPublic}...]
        if (!sspKeyPublicNoncesStorage.length) {
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
        // choose random nonce (index must be within valid array bounds: 0 to length-1)
        const pos = Math.floor(
          Math.random() * sspKeyPublicNoncesStorage.length,
        );
        const publicNoncesSSP = sspKeyPublicNoncesStorage[pos];
        // delete the nonce from the array
        sspKeyPublicNoncesStorage.splice(pos, 1);
        // save the array back to storage
        await localForage.setItem(
          'sspKeyPublicNonces',
          sspKeyPublicNoncesStorage,
        );
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
          preVerificationGas,
          callGasLimit,
          verificationGasLimit,
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

    // Handle WalletConnect rejection if user cancels transaction
    if (state.walletConnectMode && state.walletConnectTxId) {
      console.log('🔗 SendEVM: User cancelled WalletConnect transaction');
      handleWalletConnectTxRejection('Transaction cancelled by user');
    }

    navigate('/home');
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

  // Inline, chain-aware receiver-address validation for live feedback.
  const receiverValidation = txReceiver.trim()
    ? validateReceiverAddress(txReceiver, activeChain)
    : { valid: true };
  const showReceiverError =
    !!txReceiver.trim() && !receiverValidation.valid && !state.swap;

  // Live fiat estimate. Only shown for the native asset (token 0), since
  // per-token USD rates are not loaded in this view.
  const isNativeAsset = txToken === blockchainConfig.tokens[0].contract;
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
    if (!sendingAmount || isNaN(+sendingAmount)) {
      return t('send:err_invalid_amount');
    }
    if (!state.walletConnectMode && +sendingAmount <= 0) {
      return t('send:err_invalid_amount');
    }
    return null;
  };

  const feePresets: FeePresetView[] = useMemo(() => {
    const chainFees = networkFees[activeChain];
    const baseFee = chainFees?.base ?? blockchainConfig.baseFee;
    const priorityFee = chainFees?.priority ?? blockchainConfig.priorityFee;
    const totalGas = getTotalGasFromComponents();
    return [
      // Automatic = recommended gas (legacy automatic); Custom = manual gas
      // fields. Slow/Fast dropped for a simpler two-option fee choice.
      (() => {
        const gas = presetGasEvm('normal', baseFee, priorityFee);
        return {
          key: 'normal' as const,
          feeAmount: totalGas
            ? evmFeeTotalEth(totalGas, gas.base, gas.priority)
            : null,
        };
      })(),
      {
        key: 'custom',
        feeAmount: txFee !== '---' ? txFee || null : null,
      },
    ];
  }, [
    networkFees,
    activeChain,
    blockchainConfig,
    preVerificationGas,
    callGasLimit,
    verificationGasLimit,
    txFee,
  ]);

  const selectedTokenInfo =
    blockchainConfig.tokens
      .concat(importedTokens ?? [])
      .find((tk) => tk.contract === txToken) ?? blockchainConfig.tokens[0];

  const totalDisplay = isNativeAsset
    ? new BigNumber(sendingAmount || '0')
        .plus(txFee !== '---' ? txFee || '0' : '0')
        .toFixed()
    : null;

  // Legacy manual gas inputs — exactly the fields the old SendEVM page
  // exposed under "Fee Details" (base/priority gwei + the three gas
  // components + calculated total). Editable only in custom mode.
  const customFeeContent = (
    <div>
      {/* Gas Price Settings */}
      <Form.Item
        label={
          <span>
            {t('send:base_gas_price')}
            <Tooltip title={t('send:base_gas_price_help')}>
              <CircleHelpIcon
                style={{
                  marginLeft: 8,
                  color: token.colorPrimary,
                }}
              />
            </Tooltip>
          </span>
        }
        name="base_gas_price"
        rules={[{ required: true, message: t('send:input_gas_price') }]}
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
        label={
          <span>
            {t('send:priority_gas_price')}
            <Tooltip title={t('send:priority_gas_price_help')}>
              <CircleHelpIcon
                style={{
                  marginLeft: 8,
                  color: token.colorPrimary,
                }}
              />
            </Tooltip>
          </span>
        }
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

      {/* Gas Breakdown Section - Editable */}
      <Divider style={{ margin: '16px 0' }} />
      <div style={{ marginBottom: '16px' }}>
        <Form.Item
          label={
            <span>
              {t('send:preverification_gas')}
              <Tooltip title={t('send:preverification_gas_help')}>
                <CircleHelpIcon
                  style={{
                    marginLeft: 8,
                    color: token.colorPrimary,
                  }}
                />
              </Tooltip>
            </span>
          }
          name="preverification_gas"
          rules={[
            {
              required: true,
              message: t('send:input_preverification_gas'),
            },
          ]}
        >
          <Input
            size="large"
            value={preVerificationGas}
            placeholder={t('send:preverification_gas')}
            suffix="gas"
            onChange={(e) => {
              setPreVerificationGas(e.target.value);
            }}
            disabled={!manualFee}
          />
        </Form.Item>

        <Form.Item
          label={
            <span>
              {t('send:verification_gas_limit')}
              <Tooltip title={t('send:verification_gas_limit_help')}>
                <CircleHelpIcon
                  style={{
                    marginLeft: 8,
                    color: token.colorPrimary,
                  }}
                />
              </Tooltip>
            </span>
          }
          name="verification_gas_limit"
          rules={[
            {
              required: true,
              message: t('send:input_verification_gas_limit'),
            },
          ]}
        >
          <Input
            size="large"
            value={verificationGasLimit}
            placeholder={t('send:verification_gas_limit')}
            suffix="gas"
            onChange={(e) => {
              setVerificationGasLimit(e.target.value);
            }}
            disabled={!manualFee}
          />
        </Form.Item>

        <Form.Item
          label={
            <span>
              {t('send:call_gas_limit')}
              <Tooltip title={t('send:call_gas_limit_help')}>
                <CircleHelpIcon
                  style={{
                    marginLeft: 8,
                    color: token.colorPrimary,
                  }}
                />
              </Tooltip>
            </span>
          }
          name="call_gas_limit"
          rules={[
            {
              required: true,
              message: t('send:input_call_gas_limit'),
            },
          ]}
        >
          <Input
            size="large"
            value={callGasLimit}
            placeholder={t('send:call_gas_limit')}
            suffix="gas"
            onChange={(e) => {
              setCallGasLimit(e.target.value);
            }}
            disabled={!manualFee}
          />
        </Form.Item>

        {/* Gas Summary Display */}
        <div
          style={{
            backgroundColor: token.colorFillQuaternary,
            padding: '12px',
            borderRadius: '6px',
            fontSize: '12px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 'bold',
            }}
          >
            <span>
              {t('send:total_gas_limit')}
              <Tooltip title={t('send:total_gas_help')}>
                <CircleHelpIcon
                  style={{
                    marginLeft: 8,
                    color: token.colorPrimary,
                  }}
                />
              </Tooltip>
            </span>
            <span style={{ fontFamily: 'var(--ssp-mono)' }}>
              {(
                Number(preVerificationGas) +
                Number(callGasLimit) +
                Number(verificationGasLimit)
              ).toLocaleString()}{' '}
              gas
            </span>
          </div>
          <div
            style={{
              fontSize: '11px',
              color: token.colorTextSecondary,
              marginTop: '4px',
            }}
          >
            {t('send:calculated_gas_limit_description')}
          </div>
        </div>
      </div>
    </div>
  );

  // Advanced Options (transaction data) — compose-step extra, lifted from
  // the legacy Collapse. Shown expanded automatically when a dApp provided
  // calldata via WalletConnect.
  const composeExtra = (
    <Collapse
      size="small"
      style={{ marginTop: '4px', textAlign: 'left' }}
      activeKey={showAdvancedOptions || (state?.data && txData) ? ['2'] : []}
      onChange={(keys: string[] | string) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        setShowAdvancedOptions(keysArray.includes('2'));
      }}
      items={[
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
                          color: token.colorPrimary,
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
                  style={{ fontFamily: 'var(--ssp-mono)', fontSize: '12px' }}
                />
              </Form.Item>
              {txData && (
                <div
                  style={{
                    fontSize: '12px',
                    color: token.colorTextSecondary,
                    marginTop: '-15px',
                    marginBottom: '15px',
                    textAlign: 'left',
                  }}
                >
                  {t('send:contract_interaction')}:{' '}
                  {decodeTransactionData(txData)}
                </div>
              )}
              {txToken && txToken !== blockchainConfig.tokens[0].contract && (
                <Alert
                  message={t('send:warn_data_only_eth', {
                    symbol: blockchainConfig.symbol,
                  })}
                  type="warning"
                  showIcon
                  style={{
                    marginTop: '-10px',
                    marginBottom: '15px',
                    fontSize: '12px',
                  }}
                />
              )}
              {txData && txData.startsWith('0xa9059cbb') && (
                <Alert
                  message={t('send:warn_token_transfer_override')}
                  type="warning"
                  showIcon
                  style={{
                    marginTop: '-10px',
                    marginBottom: '15px',
                    fontSize: '12px',
                  }}
                />
              )}
            </div>
          ),
        },
      ]}
    />
  );

  // Fields that must stay mounted for form values but have no visible
  // rendering of their own in the new flow.
  const hiddenFormContent = (
    <>
      {/* Hidden field for WalletConnect mode flag */}
      <Form.Item name="walletConnectMode" style={{ display: 'none' }}>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item
        label={t('send:max_fee')}
        name="fee"
        style={{ display: 'none' }}
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
    </>
  );

  return {
    chainType: 'evm',
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
    tokenSelect: {
      items: tokenItems,
      value: txToken,
      onChange: (value: string) => {
        setTxToken(value);
      },
      disabled: !!state.swap,
    },
    receiver: {
      value: txReceiver,
      set: (value: string) => {
        setTxReceiver(value);
        form.setFieldValue('receiver', value);
      },
      disabled: !!(state?.walletConnectMode && state?.receiver),
      valid: !!txReceiver.trim() && receiverValidation.valid,
      showError: showReceiverError,
      errorText: showReceiverError
        ? receiverValidation.warningChainType
          ? t('send:err_wrong_chain_address', {
              chain: blockchainConfig.name,
            })
          : t('send:err_invalid_receiver')
        : null,
      qrEnabled: !(state?.walletConnectMode && state?.receiver),
    },
    amount: {
      value: sendingAmount,
      set: (value: string) => {
        setSendingAmount(value);
        setUseMaximum(false);
      },
      status: validateStatusAmount,
      suffix: selectedTokenInfo.symbol ?? blockchainConfig.symbol,
      disabled: !!state.swap || !!(state?.walletConnectMode && state?.amount),
      fiat: isNativeAsset ? toFiat(sendingAmount) : null,
      maxDisplay: new BigNumber(spendableBalance)
        .dividedBy(
          10 ** (selectedTokenInfo.decimals ?? blockchainConfig.decimals),
        )
        .toFixed(),
      onMax: () => setUseMaximum(true),
      maxDisabled:
        !!state.swap || !!(state?.walletConnectMode && state?.amount),
    },
    message: null,
    composeExtra,
    validateCompose,
    feePresets,
    selectedPreset: feePreset,
    selectPreset: setFeePreset,
    customFeeContent,
    hiddenFormContent,
    feeDisplay: txFee || '---',
    feeSymbol: blockchainConfig.symbol,
    feeFiat: txFee !== '---' ? toFiat(txFee) : null,
    totalDisplay,
    isRBF: !!state.utxos?.length,
    approveActive: openConfirmTx,
    modals,
  };
}
