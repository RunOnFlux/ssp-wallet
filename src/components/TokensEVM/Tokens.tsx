import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import TokensTable from './TokensTable';

function Tokens() {
  const { t } = useTranslation(['home']);
  const [openImportTokenDialog, setOpenImportTokenDialog] = useState(false);

  const importToken = () => {
    console.log('import token')
    setOpenImportTokenDialog(true);
  };

  return (
    <div>
      <TokensTable />
      {openImportTokenDialog}
      <Space size={'large'} style={{ marginTop: 16, marginBottom: 8 }}>
        <Button type="primary" size="middle" onClick={() => importToken()}>
          {t('home:tokens.import_token')}
        </Button>
      </Space>
    </div>
  );
}

export default Tokens;
