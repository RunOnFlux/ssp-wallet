import { useState, useEffect } from 'react';
import { useSspLogo } from '../../hooks/useSspLogo';
import { QRCode, Typography, Button, Space, Modal, Spin, Alert } from 'antd';
import {
  LoadingOutlined,
  MobileOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
const { Paragraph, Text } = Typography;

const SOFT_TIMEOUT_SECONDS = 30;

function ConfirmTxKey(props: {
  open: boolean;
  txHex: string;
  chain: string;
  wallet: string;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const sspLogo = useSspLogo();
  const { open, openAction, txHex, chain, wallet } = props;
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track elapsed time while waiting for the SSP Key approval. Resets each
  // time the modal opens. This is purely presentational — the signature is
  // still received/transmitted via the existing relay flow which closes the
  // modal externally.
  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  const qrSize = windowWidth < 420 ? 290 : 340;

  const handleOk = () => {
    openAction(false);
  };

  const formatElapsed = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const checklistItems = [
    {
      icon: <MobileOutlined />,
      label: t('home:confirmTxKey.step_open'),
    },
    {
      icon: <FileSearchOutlined />,
      label: t('home:confirmTxKey.step_review'),
    },
    {
      icon: <CheckCircleOutlined />,
      label: t('home:confirmTxKey.step_approve'),
    },
  ];

  const waitingState = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
        <Text strong style={{ fontSize: 16 }}>
          {t('home:confirmTxKey.waiting_title')}
        </Text>
        <Text type="secondary">
          {t('home:confirmTxKey.elapsed', {
            time: formatElapsed(elapsedSeconds),
          })}
        </Text>
      </Space>
      <Space
        direction="vertical"
        size="small"
        style={{
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          textAlign: 'left',
        }}
      >
        {checklistItems.map((item, index) => (
          <Space key={index} align="start">
            <Text type="secondary">{item.icon}</Text>
            <Text>
              <Text type="secondary">{index + 1}.</Text> {item.label}
            </Text>
          </Space>
        ))}
      </Space>
      {elapsedSeconds >= SOFT_TIMEOUT_SECONDS && (
        <Alert
          type="warning"
          showIcon
          message={t('home:confirmTxKey.soft_timeout_title')}
          description={t('home:confirmTxKey.soft_timeout_description')}
          style={{ textAlign: 'left' }}
        />
      )}
    </Space>
  );

  return (
    <>
      <Modal
        title={t('home:confirmTxKey.confirm_tx_key')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:ok')}
          </Button>,
        ]}
      >
        {waitingState}
        {txHex.length < 1250 && (
          <>
            <p style={{ marginTop: 20 }}>{t('home:confirmTxKey.info_1')}</p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <QRCode
                errorLevel="M"
                value={`${chain}:${wallet}:${txHex}`}
                icon={sspLogo}
                size={qrSize}
                style={{ margin: '0 auto' }}
              />
              <Paragraph
                copyable={{ text: `${chain}:${wallet}:${txHex}` }}
                className="copyableAddress"
              >
                <Text>{`${chain}:${wallet}:${txHex}`}</Text>
              </Paragraph>
            </Space>
          </>
        )}
        {txHex.length >= 1250 && (
          <>
            <p style={{ marginTop: 20 }}>{t('home:confirmTxKey.info_2')}</p>
            <Space
              direction="vertical"
              size="large"
              style={{ marginBottom: 15 }}
            >
              <Paragraph
                copyable={{ text: `${chain}:${wallet}:${txHex}` }}
                className="copyableAddress"
              >
                <Text>{`${chain}:${wallet}:${txHex}`}</Text>
              </Paragraph>
            </Space>
          </>
        )}
      </Modal>
    </>
  );
}

export default ConfirmTxKey;
