import { useAppSelector } from '../../hooks';
import { Modal, Button, Space, Typography } from 'antd';
const { Text } = Typography;
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { getSwapHistory } from '../../lib/ABEController';
import { swapHistoryOrder } from '../../types';
import {
  LoaderCircle as LoaderCircleIcon,
  ArrowDownUp as ArrowDownUpIcon,
} from 'lucide-react';
import SwapBox from './SwapBox';
import EmptyState from '../EmptyState/EmptyState';

function SwapHistory(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { sspWalletKeyInternalIdentity: sspwkid } = useAppSelector(
    (state) => state.sspState,
  );
  const [swapHistory, setSwapHistory] = useState<swapHistoryOrder[]>([]);
  const { abeMapping } = useAppSelector((state) => state.abe);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [reverseAbeMapping, setReverseAbeMapping] = useState<
    Record<string, string>
  >({});
  // on open, fetch swap history
  useEffect(() => {
    if (props.open) {
      constructReverseAbeMapping();
      fetchSwapHistory(sspwkid);
    }
  }, [props.open]);

  const constructReverseAbeMapping = () => {
    const reverseAbeMapping: Record<string, string> = {};
    for (const [key, value] of Object.entries(abeMapping)) {
      reverseAbeMapping[value] = key;
    }
    setReverseAbeMapping(reverseAbeMapping);
  };

  const fetchSwapHistory = async (sspwid: string) => {
    try {
      setLoading(true);
      const obtainedSwapHistory = await getSwapHistory(sspwid);
      // we should also fetch provider details
      // console.log(swapHistory);
      console.log(sspwid);
      setSwapHistory(obtainedSwapHistory.reverse());
      console.log(swapHistory);
    } catch (error) {
      console.log(error);
      setErrorMessage(t('home:swap.error_fetching_swap_history'));
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    props.openAction(false);
  };

  return (
    <>
      <Modal
        title={t('home:navbar.swap_history')}
        open={props.open}
        style={{ textAlign: 'center' }}
        onCancel={handleExit}
        footer={[]}
        width="min(560px, calc(100vw - 32px))"
      >
        <Space
          direction="vertical"
          size="small"
          style={{ width: '100%', marginBottom: 16, marginTop: 16 }}
        >
          {loading ? (
            <>
              <LoaderCircleIcon
                className="lucide-spin"
                style={{ fontSize: '24px' }}
              />
              <Text strong style={{ fontSize: '16px' }}>
                {t('common:loading')}
              </Text>
            </>
          ) : (
            swapHistory.map((swap) => (
              <SwapBox
                key={swap.swapId}
                swap={swap}
                reverseAbeMapping={reverseAbeMapping}
              />
            ))
          )}
          {!loading && !errorMessage && swapHistory.length === 0 && (
            <EmptyState
              icon={<ArrowDownUpIcon />}
              description={t('home:swap.no_swap_history')}
            />
          )}
          {errorMessage && (
            <Text style={{ color: '#ef4444', fontSize: 14 }}>
              {errorMessage}
            </Text>
          )}
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
