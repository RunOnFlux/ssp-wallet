import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

function Tokens(props: {
  chain: string;
  contract: string;
}) {
  const { t } = useTranslation(['home']);
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);

  const importToken = () => {
    console.log('import token');
    setOpenImportTokenDialog(true);
  };

  return (
    <div>
      Token information on click open details. Logo left, name top symbol bottom
      center, right balance plus fiat under balance.
    </div>
  );
}

export default Tokens;
