import { Image, Button, Form, Modal, message, Input, Space } from 'antd';
import { NoticeType } from 'antd/es/message/interface';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
} from '@ant-design/icons';

import secureLocalStorage from 'react-secure-storage';

import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';

interface passwordForm {
  password: string;
}

// check if password is correct
function ConfirmTxKey(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const [form] = Form.useForm();
  const { open, openAction } = props;
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = () => {
    form.resetFields();
    openAction(true);
  };

  const handleNotOk = () => {
    form.resetFields();
    openAction(false);
  };

  const onFinish = (values: passwordForm) => {
    if (values.password.length < 8) {
      displayMessage('error', 'Invalid password. Please try again.');
      return;
    }
    // try to decrypt
    const xpubEncrypted = secureLocalStorage.getItem('xpub-48-19167-0-0');
    if (typeof xpubEncrypted === 'string') {
      passworderDecrypt(values.password, xpubEncrypted)
        .then((xpub) => {
          if (typeof xpub === 'string') {
            // went well
            handleOk();
          } else {
            displayMessage(
              'error',
              'Code L2: Wallet data missing. Please restore your wallet.',
            );
          }
        })
        .catch((error) => {
          displayMessage('error', 'Password is not valid. Please try again.');
          console.log(error);
        });
    } else {
      displayMessage(
        'error',
        'Code PC1:  Wallet data missing. Please restore your wallet.',
      );
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="Confirm Password"
        open={open}
        onCancel={handleNotOk}
        style={{ textAlign: 'center', top: 60, width: 200 }}
        footer={[]}
      >
        <Space direction="vertical" size="large">
          <Image width={50} preview={false} src="/ssp-logo.svg" />
          <p>
            You are about to access sensitive information.
            <br />
            Grant access with psasword.
          </p>
          <Form
            form={form}
            name="pwForm"
            onFinish={(values) => void onFinish(values as passwordForm)}
            autoComplete="off"
            layout="vertical"
          >
            <Form.Item
              label="Confirm with Password"
              name="password"
              style={{
                display: 'flex',
                justifyContent: 'center',
              }}
              rules={[
                {
                  required: true,
                  message: 'Please input your password',
                },
              ]}
            >
              <Input.Password
                size="large"
                placeholder="Confirm with Password"
                prefix={<LockOutlined />}
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
                className="password-input"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" size="large" htmlType="submit">
                Grant Access
              </Button>
            </Form.Item>
            <Button type="link" block size="small" onClick={handleNotOk}>
              Cancel
            </Button>
          </Form>
        </Space>
      </Modal>
    </>
  );
}

export default ConfirmTxKey;
