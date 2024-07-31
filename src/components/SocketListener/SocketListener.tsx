import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import TxSent from '../../components/TxSent/TxSent';
import TxRejected from '../../components/TxRejected/TxRejected';

function SocketListener(props: {
  txSent: () => void;
  txRejected: () => void;
  ignorePopups?: boolean;
}) {
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
    if (props.ignorePopups) {
      return;
    }
    console.log(socketTxid);
    if (socketTxid) {
      setTxid(socketTxid);
      clearTxid?.();
      props.txRejected();
    }
  }, [socketTxid]);

  useEffect(() => {
    if (props.ignorePopups) {
      return;
    }
    if (txRejected) {
      setOpenTxRejected(true);
      clearTxRejected?.();
      props.txRejected();
    }
  }, [txRejected]);

  useEffect(() => {
    if (props.ignorePopups) {
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

SocketListener.defaultProps = {
  ignorePopups: false,
};

export default SocketListener;
