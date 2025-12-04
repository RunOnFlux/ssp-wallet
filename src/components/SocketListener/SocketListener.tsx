import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';

interface Props {
  txSentProp: () => void;
  txRejectedProp: () => void;
  ignorePopups?: boolean;
}

function SocketListener({
  txSentProp,
  txRejectedProp,
  ignorePopups = false,
}: Props) {
  const {
    txid: socketTxid,
    clearTxid,
    txRejected,
    chain,
    clearTxRejected,
  } = useSocket();
  const [openTxSent, setOpenTxSent] = useState(false);
  const [openTxRejected, setOpenTxRejected] = useState(false);
  const [txid, setTxid] = useState('');

  useEffect(() => {
    if (!socketTxid) {
      return;
    }
    // Always notify parent and store txid
    setTxid(socketTxid);
    clearTxid?.();
    txSentProp();

    // Show popup only if not ignoring
    if (!ignorePopups) {
      setOpenTxSent(true);
    }
  }, [socketTxid]);

  useEffect(() => {
    if (!txRejected) {
      return;
    }
    // Always notify parent
    txRejectedProp();
    clearTxRejected?.();

    // Show popup only if not ignoring
    if (!ignorePopups) {
      setOpenTxRejected(true);
    }
  }, [txRejected]);

  const txSentAction = (status: boolean) => {
    setOpenTxSent(status);
  };

  const txRejectedAction = (status: boolean) => {
    setOpenTxRejected(status);
  };
  return (
    <>
      <TxSent
        open={openTxSent}
        openAction={txSentAction}
        txid={txid}
        chain={chain}
      />
      <TxRejected open={openTxRejected} openAction={txRejectedAction} />
    </>
  );
}

export default SocketListener;
