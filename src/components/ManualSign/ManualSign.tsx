import { useAppSelector } from '../../hooks';
import SignMessage from '../SignMessage/SignMessage';

function ManualSign (props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  
  const { sspWalletExternalIdentity: wExternalIdentity } = useAppSelector(
    (state) => state.sspState,
  );

  const handleExit = () => {
    props.openAction(false);
  };

  return (
    <SignMessage 
      open={props.open} 
      address={wExternalIdentity}
      message={''}
      chain={'btc'}
      exitAction={handleExit}
    />
  )
}

export default ManualSign