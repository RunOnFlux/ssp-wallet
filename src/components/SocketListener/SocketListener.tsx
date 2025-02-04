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
    if (socketTxid) {
      setTxid(socketTxid);
      clearTxid?.();
      txSentProp();
    }
    if (ignorePopups) {
      return;
    }
    if (socketTxid) {
      setTxid(socketTxid);
      clearTxid?.();
    }
  }, [socketTxid]);

  useEffect(() => {
    if (txRejected) {
      txRejectedProp();
    }
    if (ignorePopups) {
      return;
    }
    if (txRejected) {
      setOpenTxRejected(true);
      clearTxRejected?.();
    }
  }, [txRejected]);

  useEffect(() => {
    if (ignorePopups) {
      return;
    }
    if (txid) {
      setOpenTxSent(true);
    }
  }, [txid]);

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
