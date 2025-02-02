import { Image, Button, Form, Modal, message, Input, Space } from 'antd';
import { NoticeType } from 'antd/es/message/interface';

import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
} from '@ant-design/icons';

import secureLocalStorage from 'react-secure-storage';

import { decrypt as passworderDecrypt } from '@metamask/browser-passworder';
import { useTranslation } from 'react-i18next';

import { useAppSelector } from '../../hooks';
import { getScriptType } from '../../lib/wallet';
import { getFingerprint } from '../../lib/fingerprint';
import { blockchains } from '@storage/blockchains';

interface passwordForm {
  password: string;
}

// check if password is correct
function PasswordConfirm(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { activeChain } = useAppSelector((state) => state.sspState);
  const blockchainConfig = blockchains[activeChain];
  const { t } = useTranslation(['home', 'common', 'login', 'cr']);
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

  const getRandomParams = async () => {
    const randomParams = secureLocalStorage.getItem('randomParams');
    const randomParamFingerprint = getFingerprint('forRandomParams');
    if (
      randomParams &&
      typeof randomParams === 'string' &&
      randomParams.length
    ) {
      const rp = await passworderDecrypt(randomParamFingerprint, randomParams);
      return rp || '';
    } else {
      return '';
    }
  };

  const onFinish = async (values: passwordForm) => {
    if (values.password.length < 8) {
      displayMessage('error', t('login:err_invalid_pw_2'));
      return;
    }
    // try to decrypt
    const xpubEncrypted = secureLocalStorage.getItem(
      `xpub-48-${blockchainConfig.slip}-0-${getScriptType(
        blockchainConfig.scriptType,
      )}-${blockchainConfig.id}`,
    );
    const storedRandomParams = (await getRandomParams()) as string;
    if (typeof xpubEncrypted === 'string') {
      passworderDecrypt(values.password + storedRandomParams, xpubEncrypted)
        .then((xpub) => {
          if (typeof xpub === 'string') {
            // went well
            handleOk();
          } else {
            displayMessage('error', t('login:err_lx', { code: 'L2' }));
          }
        })
        .catch((error) => {
          displayMessage(
            'error',
            t('home:passwordConfirm.err_pw_not_valid_try'),
          );
          console.log(error);
        });
    } else {
      displayMessage('error', t('home:passwordConfirm.err_pc1'));
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('cr:confirm_password')}
        open={open}
        onCancel={handleNotOk}
        style={{ textAlign: 'center', top: 60, width: 200 }}
        footer={[]}
      >
        <Space direction="vertical" size="large">
          <Image width={50} preview={false} src="/ssp-logo-black.svg" />
          <p>
            {t('home:passwordConfirm.grant_access_info_1')}
            <br />
            {t('home:passwordConfirm.grant_access_info_2')}
          </p>
          <Form
            form={form}
            name="pwForm"
            onFinish={(values) => void onFinish(values as passwordForm)}
            autoComplete="off"
            layout="vertical"
          >
            <Form.Item
              label={t('home:passwordConfirm.confirm_with_pw')}
              name="password"
              rules={[
                {
                  required: true,
                  message: t('cr:input_password'),
                },
              ]}
            >
              <Input.Password
                size="large"
                placeholder={t('home:passwordConfirm.confirm_with_pw')}
                prefix={<LockOutlined />}
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
                className="password-input"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" size="large" htmlType="submit">
                {t('home:passwordConfirm.grant_access')}
              </Button>
            </Form.Item>
            <Button type="link" block size="small" onClick={handleNotOk}>
              {t('common:cancel')}
            </Button>
          </Form>
        </Space>
      </Modal>
    </>
  );
}

export default PasswordConfirm;
