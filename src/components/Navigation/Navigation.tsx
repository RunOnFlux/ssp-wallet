import { Button } from 'antd';
import { ArrowUpOutlined } from '@ant-design/icons';

function Navigation() {
  return (
    <>
      <div>
        <Button
          type="dashed"
          shape="round"
          icon={<ArrowUpOutlined />}
          size={'large'}
        >
          Send
        </Button>
      </div>
    </>
  );
}

export default Navigation;
