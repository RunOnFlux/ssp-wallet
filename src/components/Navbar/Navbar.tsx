import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAppDispatch } from '../../hooks';
import { setFluxInitialState, setPasswordBlobInitialState } from '../../store';
import { Row, Col, Image, Menu } from 'antd';
import { LockOutlined, SettingOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import './Navbar.css';

const menuItems: MenuProps['items'] = [
  {
    key: 'Menu',
    icon: <SettingOutlined style={{ fontSize: '14px' }} />,
    style: {
      border: 'none',
      width: '30px',
      height: '30px',
      lineHeight: '30px',
      display: 'flex',
      padding: '4px 0px 4px 9px',
      margin: 0,
      marginTop: '-2px',
    },
    children: [
      {
        label: 'Address Details',
        key: 'account',
      },
      {
        label: 'SSP Wallet Details',
        key: 'wallet',
      },
    ],
  },
  {
    key: 'Lock',
    icon: <LockOutlined />,
    style: {
      border: 'none',
      width: '30px',
      height: '30px',
      lineHeight: '30px',
      display: 'flex',
      padding: '4px 23px 0px 9px',
      margin: 0,
    },
  },
];

function Navbar() {
  const [current, setCurrent] = useState('');

  const onClick: MenuProps['onClick'] = (e) => {
    console.log('click ', e);
    setCurrent(e.key);
    if (e.key === 'Lock') logout();
  };
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
        <Col span={16} style={{ fontSize: '16px', lineHeight: '36px' }}>
          Flux Wallet 1
        </Col>
        <Col span={4}>
          <Menu
            triggerSubMenuAction="click"
            onClick={onClick}
            selectedKeys={[current]}
            mode="horizontal"
            items={menuItems}
            style={{
              border: 'none',
              height: '30px',
              overflow: 'visible',
              lineHeight: 'inherit',
              display: 'flex',
              padding: '0',
              paddingInline: 0,
              marginInline: 0,
            }}
          />
        </Col>
      </Row>
    </div>
  );
}

export default Navbar;
