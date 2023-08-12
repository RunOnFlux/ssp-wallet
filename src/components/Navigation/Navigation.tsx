import { useNavigate } from 'react-router-dom';
import { Button, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

function Navigation() {
  const navigate = useNavigate();
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
          Send
        </Button>
        <Button
          type="dashed"
          shape="round"
          icon={<ArrowDownOutlined />}
          size={'large'}
          onClick={() => navigate('/send')}
        >
          Receive
        </Button>
      </Space>
    </>
  );
}

export default Navigation;
