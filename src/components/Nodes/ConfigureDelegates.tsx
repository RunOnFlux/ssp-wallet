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
const DELEGATE_NAME_MAX_LENGTH = 24;

export interface NamedDelegate {
  name: string;
  key: string;
}

const getDelegatesStorageKey = (chain: keyof cryptos, walletInUse: string) =>
  `node-delegates-${chain}-${walletInUse}`;

// Normalises stored delegates, migrating the legacy `string[]` format (keys
// only) to the named `{ name, key }` format on the fly.
const normaliseDelegates = (stored: unknown): NamedDelegate[] => {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((item): NamedDelegate => {
      if (typeof item === 'string') return { name: '', key: item };
      const d = item as Partial<NamedDelegate>;
      return { name: d.name ?? '', key: d.key ?? '' };
    })
    .filter((d) => d.key);
};

function ConfigureDelegates(props: {
  open: boolean;
  onClose: () => void;
  chain: keyof cryptos;
  walletInUse: string;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [delegates, setDelegates] = useState<NamedDelegate[]>([]);
  const [newDelegate, setNewDelegate] = useState('');
  const [newDelegateName, setNewDelegateName] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  const blockchainConfig = blockchains[props.chain];
  const storageKey = getDelegatesStorageKey(props.chain, props.walletInUse);
  const walletNumber = Number(props.walletInUse.split('-')[1]) + 1;

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({ type, content });
  };

  useEffect(() => {
    if (props.open) {
      void loadDelegates();
    }
  }, [props.open, props.chain, props.walletInUse]);

  const loadDelegates = async () => {
    const stored = await localForage.getItem<unknown>(storageKey);
    setDelegates(normaliseDelegates(stored));
  };

  const saveDelegates = async (newDelegates: NamedDelegate[]) => {
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
    const trimmedName = newDelegateName.trim();

    if (!isValidPublicKey(trimmedKey)) {
      displayMessage('error', t('home:nodesTable.err_invalid_delegate_key'));
      return;
    }

    if (delegates.length >= MAX_DELEGATES) {
      displayMessage('error', t('home:nodesTable.err_max_delegates'));
      return;
    }

    if (delegates.some((d) => d.key === trimmedKey)) {
      displayMessage('error', t('home:nodesTable.err_duplicate_delegate'));
      return;
    }

    const newDelegates = [...delegates, { name: trimmedName, key: trimmedKey }];
    await saveDelegates(newDelegates);
    setNewDelegate('');
    setNewDelegateName('');
    displayMessage('success', t('home:nodesTable.delegates_saved'));
  };

  const handleRemoveDelegate = async (index: number) => {
    const newDelegates = delegates.filter((_, i) => i !== index);
    await saveDelegates(newDelegates);
    displayMessage('success', t('home:nodesTable.delegates_saved'));
  };

  const handleClose = () => {
    setNewDelegate('');
    setNewDelegateName('');
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

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Input
            placeholder={t('home:nodesTable.delegate_name')}
            value={newDelegateName}
            onChange={(e) => setNewDelegateName(e.target.value)}
            onPressEnter={() => void handleAddDelegate()}
            disabled={delegates.length >= MAX_DELEGATES}
            maxLength={DELEGATE_NAME_MAX_LENGTH}
          />
          <div style={{ display: 'flex', gap: 8 }}>
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
              disabled={
                delegates.length >= MAX_DELEGATES || !newDelegate.trim()
              }
            />
          </div>
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
                    style={{ fontSize: 12, marginBottom: 4, display: 'block' }}
                  >
                    {item.name ||
                      t('home:nodesTable.delegate_n', { index: index + 1 })}
                  </Text>
                  <Text
                    copyable
                    type="secondary"
                    style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      display: 'block',
                    }}
                  >
                    {item.key}
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

// Returns the full named delegate list (migration-aware).
export const getNamedDelegates = async (
  chain: keyof cryptos,
  walletInUse: string,
): Promise<NamedDelegate[]> => {
  const storageKey = getDelegatesStorageKey(chain, walletInUse);
  const stored = await localForage.getItem<unknown>(storageKey);
  return normaliseDelegates(stored);
};

// Returns just the delegate public keys (migration-aware). Kept for callers
// that only need the keys.
export const getDelegates = async (
  chain: keyof cryptos,
  walletInUse: string,
): Promise<string[]> => {
  const named = await getNamedDelegates(chain, walletInUse);
  return named.map((d) => d.key);
};
