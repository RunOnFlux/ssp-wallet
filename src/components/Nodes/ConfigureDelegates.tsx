import { useEffect, useState } from 'react';
import { Modal, Input, Button, message, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';
import { NoticeType } from 'antd/es/message/interface';

const { Text } = Typography;

const MAX_DELEGATES = 4;
const DELEGATE_KEY_LENGTH = 66;

const getDelegatesStorageKey = (chain: keyof cryptos, walletInUse: string) =>
  `node-delegates-${chain}-${walletInUse}`;

function ConfigureDelegates(props: {
  open: boolean;
  onClose: () => void;
  chain: keyof cryptos;
  walletInUse: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [delegates, setDelegates] = useState<string[]>([]);
  const [newDelegate, setNewDelegate] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  const blockchainConfig = blockchains[props.chain];
  const storageKey = getDelegatesStorageKey(props.chain, props.walletInUse);
  const walletNumber = Number(props.walletInUse.split('-')[1]) + 1;

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    if (props.open) {
      void loadDelegates();
    }
  }, [props.open, props.chain, props.walletInUse]);

  const loadDelegates = async () => {
    const stored = await localForage.getItem<string[]>(storageKey);
    if (stored) {
      setDelegates(stored);
    } else {
      setDelegates([]);
    }
  };

  const saveDelegates = async (newDelegates: string[]) => {
    await localForage.setItem(storageKey, newDelegates);
    setDelegates(newDelegates);
  };

  const isValidPublicKey = (key: string): boolean => {
    if (key.length !== DELEGATE_KEY_LENGTH) {
      return false;
    }
    // Check if it's valid hex
    return /^[0-9a-fA-F]+$/.test(key);
  };

  const handleAddDelegate = async () => {
    const trimmedKey = newDelegate.trim();

    if (!isValidPublicKey(trimmedKey)) {
      displayMessage('error', t('home:nodesTable.err_invalid_delegate_key'));
      return;
    }

    if (delegates.length >= MAX_DELEGATES) {
      displayMessage('error', t('home:nodesTable.err_max_delegates'));
      return;
    }

    if (delegates.includes(trimmedKey)) {
      displayMessage('error', t('home:nodesTable.err_duplicate_delegate'));
      return;
    }

    const newDelegates = [...delegates, trimmedKey];
    await saveDelegates(newDelegates);
    setNewDelegate('');
    displayMessage('success', t('home:nodesTable.delegates_saved'));
  };

  const handleRemoveDelegate = async (index: number) => {
    const newDelegates = delegates.filter((_, i) => i !== index);
    await saveDelegates(newDelegates);
    displayMessage('success', t('home:nodesTable.delegates_saved'));
  };

  const handleClose = () => {
    setNewDelegate('');
    props.onClose();
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:nodesTable.configure_delegates_title', {
          chainName: blockchainConfig.name,
          wallet: walletNumber,
        })}
        open={props.open}
        onCancel={handleClose}
        footer={[
          <Button key="close" onClick={handleClose}>
            {t('common:close')}
          </Button>,
        ]}
      >
        <p>{t('home:nodesTable.configure_delegates_info')}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input
            placeholder={t('home:nodesTable.delegate_public_key')}
            value={newDelegate}
            onChange={(e) => setNewDelegate(e.target.value)}
            onPressEnter={() => void handleAddDelegate()}
            disabled={delegates.length >= MAX_DELEGATES}
            maxLength={DELEGATE_KEY_LENGTH}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => void handleAddDelegate()}
            disabled={delegates.length >= MAX_DELEGATES || !newDelegate.trim()}
          />
        </div>

        {delegates.length === 0 ? (
          <Text type="secondary">{t('home:nodesTable.no_delegates')}</Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {delegates.map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, marginBottom: 4, display: 'block' }}
                  >
                    Delegate {index + 1}
                  </Text>
                  <Text
                    copyable
                    style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      display: 'block',
                    }}
                  >
                    {item}
                  </Text>
                </div>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => void handleRemoveDelegate(index)}
                  style={{ marginTop: 18 }}
                />
              </div>
            ))}
          </div>
        )}

        {delegates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">
              {t('home:nodesTable.delegates_count', {
                count: delegates.length,
              })}
            </Text>
          </div>
        )}
      </Modal>
    </>
  );
}

export default ConfigureDelegates;

export const getDelegates = async (
  chain: keyof cryptos,
  walletInUse: string,
): Promise<string[]> => {
  const storageKey = getDelegatesStorageKey(chain, walletInUse);
  const stored = await localForage.getItem<string[]>(storageKey);
  return stored || [];
};
