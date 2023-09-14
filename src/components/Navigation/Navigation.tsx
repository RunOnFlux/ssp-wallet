import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import Receive from '../Receive/Receive';
import { useTranslation } from 'react-i18next';

function Navigation() {
  const { t } = useTranslation(['home']);
  const navigate = useNavigate();
  const [openReceive, setOpenReceive] = useState(false);
  const receiveAction = (status: boolean) => {
    setOpenReceive(status);
  };
  return (
    <>
      <Space direction="horizontal" size="large" style={{ marginBottom: 15 }}>
        <Button
          type="dashed"
          shape="round"
          icon={<ArrowUpOutlined />}
          size={'large'}
          onClick={() => navigate('/send')}
        >
          {t('home:navigation.send')}
        </Button>
        <Button
          type="dashed"
          shape="round"
          icon={<ArrowDownOutlined />}
          size={'large'}
          onClick={() => {
            receiveAction(true);
          }}
        >
          {t('home:navigation.receive')}
        </Button>
      </Space>
      <Receive open={openReceive} openAction={receiveAction} />
    </>
  );
}

export default Navigation;
