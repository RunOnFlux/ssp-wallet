import { useState, useEffect } from 'react';
import { Input } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { getDisplayName, setWalletName } from '../../storage/walletNames';
import { cryptos } from '../../types';
import './WalletName.css';

interface WalletNameProps {
  walletId: string;
  chain: keyof cryptos;
  editable?: boolean;
  maxLength?: number;
  showFullAddress?: boolean;
  className?: string;
}

const WalletName = ({
  walletId,
  chain,
  editable = false,
  maxLength = 25,
  showFullAddress = false,
  className = '',
}: WalletNameProps) => {
  const { t } = useTranslation(['common']);
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState('');
  const [showEditIcon, setShowEditIcon] = useState(false);

  // Fast Redux access for current custom name
  const customName = useAppSelector(
    (state) => state.walletNames?.chains[chain]?.[walletId],
  );

  // Delay showing edit icon only if editable to prevent flickering
  useEffect(() => {
    setShowEditIcon(false);
    if (editable) {
      const timer = setTimeout(() => setShowEditIcon(true), 150);
      return () => clearTimeout(timer);
    }
  }, [editable, chain, walletId]);

  // Get display name with fallback logic
  const displayName = showFullAddress
    ? walletId
    : customName || getDisplayName(chain, walletId);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTempName(customName || '');
    setEditing(true);
  };

  const handleSave = async (e?: React.MouseEvent): Promise<void> => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      await setWalletName(chain, walletId, tempName);
      setEditing(false);
    } catch (error) {
      console.error('Failed to save wallet name:', error);
    }
  };

  const handleCancel = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setTempName('');
    setEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      void handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (editing) {
    return (
      <div
        className={`wallet-name-edit ${className}`}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Input
          value={tempName}
          onChange={(e) => setTempName(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyPress}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          placeholder={getDisplayName(chain, walletId)}
          autoFocus
          style={{ flex: 1, minWidth: '120px' }}
          size="small"
        />
        <div className="wallet-name-actions">
          <CheckOutlined
            onClick={(e) => void handleSave(e)}
            className="wallet-name-save"
            title={t('save')}
          />
          <CloseOutlined
            onClick={(e) => handleCancel(e)}
            className="wallet-name-cancel"
            title={t('cancel')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`wallet-name ${className}`}>
      <span className="wallet-name-text">{displayName}</span>
      {editable && !editing && showEditIcon && (
        <EditOutlined
          onClick={handleStartEdit}
          className="wallet-name-edit-icon"
          title={t('rename_wallet')}
        />
      )}
    </div>
  );
};

export default WalletName;
