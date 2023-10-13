import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, message, Divider, Button, Input, Space, Popconfirm } from 'antd';
import { Link } from 'react-router-dom';
import { NoticeType } from 'antd/es/message/interface';
import Navbar from '../../components/Navbar/Navbar';
import { constructAndSignTransaction } from '../../lib/constructTx';
import { useAppSelector } from '../../hooks';
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

import { transaction } from '../../types';

interface sendForm {
  receiver: string;
  amount: string;
  fee: string;
  message: string;
}

let txSentInterval: string | number | NodeJS.Timeout | undefined;

function Send() {
  const {
    txid: socketTxid,
    clearTxid,
    txRejected,
    chain: txChain,
    clearTxRejected,
  } = useSocket();
  const { t } = useTranslation(['send', 'common']);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const { activeChain, sspWalletKeyIdentity } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse } = useAppSelector(
    (state) => state[activeChain],
  );
  const transactions = wallets[walletInUse].transactions;
  const redeemScript = wallets[walletInUse].redeemScript;
  const witnessScript = wallets[walletInUse].witnessScript;
  const sender = wallets[walletInUse].address;
  const [openConfirmTx, setOpenConfirmTx] = useState(false);
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [txHex, setTxHex] = useState('');
  const [txid, setTxid] = useState('');
  const blockchainConfig = blockchains[activeChain];
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

  useEffect(() => {
    if (txid) {
      setOpenConfirmTx(false);
      setTimeout(() => {
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
    }
  }, [socketTxid]);

  useEffect(() => {
    if (txRejected) {
      setOpenConfirmTx(false);
      setTimeout(() => {
        setOpenTxRejected(true);
      });
      if (txSentInterval) {
        clearInterval(txSentInterval);
      }
      clearTxRejected?.();
    }
  }, [txRejected]);

  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
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
          )}`,
        );
        if (typeof xprivBlob !== 'string') {
          throw new Error(t('send:err_invalid_xpriv'));
        }
        const xprivChain = await passworderDecrypt(password, xprivBlob);
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
        const amount = new BigNumber(values.amount).multipliedBy(1e8).toFixed();
        const fee = new BigNumber(values.fee).multipliedBy(1e8).toFixed();
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
        )
          .then((tx) => {
            console.log(tx);
            // post to ssp relay
            postAction('tx', tx, activeChain, wInUse, sspWalletKeyIdentity);
            setTxHex(tx);
            setOpenConfirmTx(true);
            if (txSentInterval) {
              clearInterval(txSentInterval);
            }
            txSentInterval = setInterval(() => {
              fetchTransactions();
            }, 5000);
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
      fetchAddressTransactions(sender, activeChain, 0, 3)
        .then((txs) => {
          const amount = new BigNumber(0)
            .minus(new BigNumber(values.amount).multipliedBy(1e8))
            .toFixed();
          // amount must be the same and not present in our transactions table
          txs.forEach((tx) => {
            if (tx.amount === amount) {
              const txExists = transactions.find((ttx: transaction) => ttx.txid === tx.txid);
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
  return (
    <>
      {contextHolder}
      <Navbar />
      <Divider />
      <Form
        name="sendForm"
        form={form}
        initialValues={{ tos: false }}
        onFinish={(values) => void onFinish(values as sendForm)}
        autoComplete="off"
        layout="vertical"
      >
        <Form.Item
          label={t('send:receiver_address')}
          name="receiver"
          rules={[
            {
              required: true,
              message: t('send:input_receiver_address'),
            },
          ]}
        >
          <Input size="large" placeholder={t('send:receiver_address')} />
        </Form.Item>

        <Form.Item
          label={t('send:amount_to_send')}
          name="amount"
          rules={[{ required: true, message: t('send:input_amount') }]}
        >
          <Input
            size="large"
            placeholder={t('send:input_amount')}
            suffix={blockchainConfig.symbol}
          />
        </Form.Item>

        <Form.Item
          label={t('send:fee')}
          name="fee"
          initialValue={'0.0001'}
          rules={[{ required: true, message: t('send:input_fee') }]}
        >
          <Input size="large" placeholder={t('send:tx_fee')} suffix={blockchainConfig.symbol} />
        </Form.Item>

        <Form.Item
          label={t('send:message')}
          name="message"
          rules={[{ required: false, message: t('send:include_message') }]}
        >
          <Input size="large" placeholder={t('send:payment_note')} />
        </Form.Item>

        <Form.Item>
          <Space direction="vertical" size="large">
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
              <Button type="primary" size="large">
                {t('send:send')}
              </Button>
            </Popconfirm>
            <Button type="link" block size="small">
              <Link to={'/home'}>{t('common:cancel')}</Link>
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
    </>
  );
}

export default Send;
