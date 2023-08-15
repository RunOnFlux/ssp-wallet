import { useState } from 'react';
import { Form, message, Divider, Button, Input, Space } from 'antd';
import { Link } from 'react-router-dom';
import { NoticeType } from 'antd/es/message/interface';
import Navbar from '../../components/Navbar/Navbar';
import { constructAndSignTransaction } from '../../lib/constructTx';
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { generateAddressKeypair } from '../../lib/wallet';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import ConfirmTxKey from '../../components/ConfirmTxKey/ConfirmTxKey';

interface sendForm {
  receiver: string;
  amount: string;
  fee: string;
  message: string;
}

function Send() {
  const [messageApi, contextHolder] = message.useMessage();
  const {
    address: sender,
    redeemScript,
    sspWalletKeyIdentity,
  } = useAppSelector((state) => state.flux);
  const [openConfirmTx, setopenConfirmTx] = useState(false);
  const [txHex, setTxHex] = useState('');
  const confirmTxAction = (status: boolean) => {
    setopenConfirmTx(status);
  };
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
    wkIdentity: string,
  ) => {
    const data = {
      action,
      payload,
      chain,
      wkIdentity,
    };
    axios
      .post('https://relay.ssp.runonflux.io/v1/action', data)
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
      displayMessage('error', 'Invalid receiver address.');
      return;
    }
    if (!values.amount) {
      displayMessage('error', 'Invalid amount');
      return;
    }
    // get our password to decrypt xpriv from secure storage
    const fingerprint: string = getFingerprint();
    passworderDecrypt(fingerprint, passwordBlob)
      .then(async (password) => {
        if (typeof password !== 'string') {
          throw new Error('Password is not valid.');
        }
        const xprivFluxBlob = secureLocalStorage.getItem('xpriv-48-19167-0-0');
        if (typeof xprivFluxBlob !== 'string') {
          throw new Error('Invalid wallet xpriv');
        }
        const xprivFlux = await passworderDecrypt(password, xprivFluxBlob);
        if (typeof xprivFlux !== 'string') {
          throw new Error('Invalid wallet xpriv, unable to decrypt');
        }
        const keyPair = generateAddressKeypair(xprivFlux, 0, 0, 'flux');
        const amount = new BigNumber(values.amount).multipliedBy(1e8).toFixed();
        const fee = new BigNumber(values.fee).multipliedBy(1e8).toFixed();
        constructAndSignTransaction(
          'flux',
          values.receiver,
          amount,
          fee,
          sender,
          sender,
          values.message,
          keyPair.privKey,
          redeemScript,
        )
          .then((tx) => {
            console.log(tx);
            // post to ssp relay
            postAction('tx', tx, 'flux', sspWalletKeyIdentity);
            setTxHex(tx);
            setopenConfirmTx(true);
            // todo here start listening for txs on the address to see if it was successful
          })
          .catch((error: TypeError) => {
            displayMessage('error', error.message);
            console.log(error);
          });
      })
      .catch((error) => {
        console.log(error);
        displayMessage(
          'error',
          'Code S1: Something went wrong while decrypting password.',
        );
      });
  };
  return (
    <>
      {contextHolder}
      <Navbar />
      <Divider />
      <Form
        name="sendForm"
        initialValues={{ tos: false }}
        onFinish={(values) => void onFinish(values as sendForm)}
        autoComplete="off"
        layout="vertical"
      >
        <Form.Item
          label="Receiver Address"
          name="receiver"
          rules={[
            {
              required: true,
              message: 'Please input receivers address',
            },
          ]}
        >
          <Input size="large" placeholder="Receiver Address" />
        </Form.Item>

        <Form.Item
          label="Amount to Send"
          name="amount"
          rules={[{ required: true, message: 'Input Amount to send' }]}
        >
          <Input size="large" placeholder="Amount to Send" suffix="FLUX" />
        </Form.Item>

        <Form.Item
          label="Fee"
          name="fee"
          initialValue={'0.0001'}
          rules={[{ required: true, message: 'Input Fee to send' }]}
        >
          <Input size="large" placeholder="Transaction Fee" suffix="FLUX" />
        </Form.Item>

        <Form.Item
          label="Message"
          name="message"
          rules={[
            { required: false, message: 'Include message to transaction' },
          ]}
        >
          <Input size="large" placeholder="Payment Note" />
        </Form.Item>

        <Form.Item>
          <Space direction="vertical" size="large">
            <Button type="primary" size="large" htmlType="submit">
              Send
            </Button>
            <Button type="link" block size="small">
              <Link to={'/home'}>Cancel</Link>
            </Button>
          </Space>
        </Form.Item>
      </Form>
      <ConfirmTxKey
        open={openConfirmTx}
        openAction={confirmTxAction}
        txHex={txHex}
      />
    </>
  );
}

export default Send;
