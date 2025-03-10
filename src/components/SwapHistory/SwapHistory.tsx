import { useAppSelector } from '../../hooks';
import { Modal, Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';

interface swapHistory {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
}

function SwapHistory(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { sspWalletExternalIdentity: sspwid } = useAppSelector(
    (state) => state.sspState,
  );
  const [swapHistory, setSwapHistory] = useState<swapHistory[]>([]);
  // on open, fetch swap history
  useEffect(() => {
    if (props.open) {
      fetchSwapHistory(sspwid);
    }
  }, [props.open]);

  const fetchSwapHistory = (sspwid: string) => {
    // const swapHistory = await getSwapHistory(sspwid);
    // console.log(swapHistory);
    console.log(sspwid);
    setSwapHistory([
      {
        id: '1',
        amount: '100',
        status: 'success',
        createdAt: '2021-01-01',
      },
      {
        id: '2',
        amount: '200',
        status: 'pending',
        createdAt: '2021-01-02',
      },
    ]);
    console.log(swapHistory);
  };

  const handleExit = () => {
    props.openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:navbar.swap_history')}
        open={props.open}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleExit}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Space direction="vertical" size="small">
            cards with swap history, on click expand to show more details
          </Space>
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button type="primary" size="large" onClick={handleExit}>
              {t('common:ok')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default SwapHistory;
