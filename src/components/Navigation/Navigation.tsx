import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowUpOutlined } from '@ant-design/icons';

function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <div>
        <Button
          type="dashed"
          shape="round"
          icon={<ArrowUpOutlined />}
          size={'large'}
          onClick={() => navigate('/send')}
        >
          Send
        </Button>
      </div>
    </>
  );
}

export default Navigation;
