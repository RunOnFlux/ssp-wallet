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
import PasswordConfirm from '../PasswordConfirm/PasswordConfirm';
import Settings from '../Settings/Settings';
import { useTranslation } from 'react-i18next';

function Navbar() {
  const { t } = useTranslation(['home', 'common']);
  const [actionToPerform, setActionToPerform] = useState('');
  const [openSspWalletDetails, setOpenSspWalletDetails] = useState(false);
  const sspWalletDetailsAction = (status: boolean) => {
    setOpenSspWalletDetails(status);
  };
  const [openAddressDetails, setOpenAddressDetails] = useState(false);
  const addressDetailsAction = (status: boolean) => {
    setOpenAddressDetails(status);
  };
  const [openSettingsDialogVisilbe, setOpenSettingsDialogVisible] =
    useState(false);
  const settingsDialogAction = (status: boolean) => {
    setOpenSettingsDialogVisible(status);
  };
  const [passwordConfirmDialogVisilbe, setPasswordConfirmDialogVisible] =
    useState(false);
  const passwordConfirmDialogAction = (status: boolean) => {
    if (status === true) {
      if (actionToPerform === 'address') setOpenAddressDetails(true);
      if (actionToPerform === 'sspwallet') setOpenSspWalletDetails(true);
    }
    setPasswordConfirmDialogVisible(false);
  };
  const onClick: MenuProps['onClick'] = (e) => {
    console.log('click ', e);
    if (e.key === 'Lock') logout();
    if (e.key === 'address') {
      setPasswordConfirmDialogVisible(true);
      setActionToPerform('address');
    }
    if (e.key === 'sspwallet') {
      setPasswordConfirmDialogVisible(true);
      setActionToPerform('sspwallet');
    }
    if (e.key === 'settings') setOpenSettingsDialogVisible(true);
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
          label: t('home:navbar.addr_details'),
          key: 'address',
        },
        {
          label: t('home:navbar.ssp_details'),
          key: 'sspwallet',
        },
        {
          label: t('home:settings.settings'),
          key: 'settings',
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
            {t('home:navbar.chain_wallet', {
              chain: 'Flux',
              wallet: 'Wallet 1',
            })}
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
      <PasswordConfirm
        open={passwordConfirmDialogVisilbe}
        openAction={passwordConfirmDialogAction}
      />
      <Settings
        open={openSettingsDialogVisilbe}
        openAction={settingsDialogAction}
      />
    </>
  );
}

export default Navbar;
