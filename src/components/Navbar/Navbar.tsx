import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../hooks';
import { setFluxInitialState, setPasswordBlobInitialState } from '../../store';
import { Row, Col, Image } from 'antd';
import { LockOutlined, SettingOutlined } from '@ant-design/icons';
import './Navbar.css';

function Navbar() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const logout = () => {
    void (async function () {
      if (chrome?.storage?.session) {
        try {
          await chrome.storage.session.clear();
        } catch (error) {
          console.log(error);
        }
      }
      dispatch(setFluxInitialState());
      dispatch(setPasswordBlobInitialState());
      navigate('/login');
    })();
  };
  return (
    <div className="navbar">
      <Row justify="space-evenly">
        <Col span={4}>
          <Image
            height={30}
            preview={false}
            src="/ssp-logo.svg"
            onClick={() => navigate('/home')}
          />
        </Col>
        <Col span={16}>Flux Wallet 1</Col>
        <Col span={4}>
          <SettingOutlined style={{ fontSize: '16px', paddingRight: '6px' }} />{' '}
          <LockOutlined style={{ fontSize: '16px' }} onClick={logout} />
        </Col>
      </Row>
    </div>
  );
}

export default Navbar;
