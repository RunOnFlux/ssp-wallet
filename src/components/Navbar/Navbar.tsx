import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../hooks';
import { setFluxInitialState, setPasswordBlobInitialState } from '../../store';
import { Row, Col, Image, Menu } from 'antd';
import { LockOutlined, SettingOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import './Navbar.css';
import SspWalletDetails from '../SspWalletDetails/SspWalletDetails';
import AddressDetails from '../AddressDetails/AddressDetails';

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
        key: 'address',
      },
      {
        label: 'SSP Wallet Details',
        key: 'sspwallet',
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
  const [openSspWalletDetails, setOpenSspWalletDetails] = useState(false);
  const sspWalletDetailsAction = (status: boolean) => {
    setOpenSspWalletDetails(status);
  };
  const [openAddressDetails, setOpenAddressDetails] = useState(false);
  const addressDetailsAction = (status: boolean) => {
    setOpenAddressDetails(status);
  };
  const onClick: MenuProps['onClick'] = (e) => {
    console.log('click ', e);
    if (e.key === 'Lock') logout();
    if (e.key === 'address') setOpenAddressDetails(true);
    if (e.key === 'sspwallet') setOpenSspWalletDetails(true);
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
    <>
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
              selectable={false}
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
      <SspWalletDetails
        open={openSspWalletDetails}
        openAction={sspWalletDetailsAction}
      />
      <AddressDetails
        open={openAddressDetails}
        openAction={addressDetailsAction}
      />
    </>
  );
}

export default Navbar;
