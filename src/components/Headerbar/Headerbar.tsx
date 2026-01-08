import { useNavigate } from 'react-router';
import { Row, Col, Image } from 'antd';
import './Headerbar.css';

interface Props {
  headerTitle: string;
  navigateTo: string;
}

function Headerbar({ headerTitle, navigateTo }: Props) {
  const navigate = useNavigate();

  return (
    <>
      <div className="headerbar">
        <Row justify="space-evenly">
          <Col span={4}>
            <Image
              height={30}
              preview={false}
              src="/ssp-logo-black.svg"
              onClick={() => navigate(navigateTo)}
              style={{ cursor: 'pointer' }}
            />
          </Col>
          <Col
            span={16}
            style={{
              fontSize: '16px',
              lineHeight: '36px',
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            {headerTitle}
          </Col>
          <Col span={4} />
        </Row>
      </div>
    </>
  );
}

export default Headerbar;
