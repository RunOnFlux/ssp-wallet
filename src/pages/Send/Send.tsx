import { Form, message, Divider, Button, Input } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import Navbar from '../../components/Navbar/Navbar';
import { constructAndSignTransaction } from '../../lib/constructTx';
import { useAppSelector } from '../../hooks';
import { getFingerprint } from '../../lib/fingerprint';
import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import secureLocalStorage from 'react-secure-storage';
import { generateAddressKeypair } from '../../lib/wallet';

interface sendForm {
  receiver: string;
  amount: string;
  fee: string;
  message: string;
}

function Send() {
  const [messageApi, contextHolder] = message.useMessage();
  const { address: sender, redeemScript } = useAppSelector(
    (state) => state.flux,
  );
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
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
        constructAndSignTransaction(
          'flux',
          values.receiver,
          values.amount,
          values.fee,
          sender,
          sender,
          values.message,
          keyPair.privKey,
          redeemScript,
        )
          .then((tx) => {
            console.log(tx);
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
          <Input size="large" placeholder="Amount to Send" />
        </Form.Item>

        <Form.Item
          label="Fee"
          name="fee"
          rules={[{ required: true, message: 'Input Fee to send' }]}
        >
          <Input size="large" placeholder="Fee" />
        </Form.Item>

        <Form.Item
          label="Message"
          name="message"
          rules={[
            { required: false, message: 'Include message to transaction' },
          ]}
        >
          <Input size="large" placeholder="Message" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" size="large" htmlType="submit">
            Send
          </Button>
        </Form.Item>
      </Form>
    </>
  );
}

export default Send;
