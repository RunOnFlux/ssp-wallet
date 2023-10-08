import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useAppDispatch } from '../../hooks';
import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
  setWalletInUse,
} from '../../store';
import { Row, Col, Image, Menu, Select, Divider, Button, message } from 'antd';
import { LockOutlined, SettingOutlined, PlusOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import './Navbar.css';
import SspWalletDetails from '../SspWalletDetails/SspWalletDetails';
import AddressDetails from '../AddressDetails/AddressDetails';
import PasswordConfirm from '../PasswordConfirm/PasswordConfirm';
import Settings from '../Settings/Settings';
import AutoLogout from '../AutoLogout/AutoLogout';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { generateMultisigAddress } from '../../lib/wallet.ts';
import { generatedWallets } from '../../types';
import { blockchains } from '@storage/blockchains';

interface walletOption {
  value: string;
  label: string;
}

function Navbar() {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse, xpubKey, xpubWallet } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const [actionToPerform, setActionToPerform] = useState('');
  const [openSspWalletDetails, setOpenSspWalletDetails] = useState(false);
  const [defaultWallet] = useState<walletOption>({
    value: walletInUse,
    label: t('home:navbar.chain_wallet', {
      chain: blockchainConfig.name,
      wallet:
        (+walletInUse.split('-')[0] === 1 ? 'Change ' : 'Wallet ') +
        (+walletInUse.split('-')[1] + 1),
    }),
  });
  const [walletItems, setWalletItems] = useState<walletOption[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    const wItems: walletOption[] = [];
    Object.keys(wallets).forEach((wallet) => {
      const typeNumber = Number(wallet.split('-')[0]);
      const walletNumber = Number(wallet.split('-')[1]) + 1;
      let walletName = 'Wallet ' + walletNumber;
      if (typeNumber === 1) {
        walletName = 'Change ' + walletNumber;
      }
      const wal = {
        value: wallet,
        label: t('home:navbar.chain_wallet', {
          chain: blockchainConfig.name,
          wallet: walletName,
        }),
      };
      wItems.push(wal);
    });
    wItems.sort((a, b) => {
      if (+a.value.split('-')[1] < +b.value.split('-')[1]) return -1;
      if (+a.value.split('-')[1] > +b.value.split('-')[1]) return 1;
      return 0;
    });
    wItems.sort((a, b) => {
      if (+a.value.split('-')[0] < +b.value.split('-')[0]) return -1;
      if (+a.value.split('-')[0] > +b.value.split('-')[0]) return 1;
      return 0;
    });
    setWalletItems(wItems);
  }, [wallets]);

  const handleChange = (value: { value: string; label: React.ReactNode }) => {
    console.log(value); // { value: "lucy", key: "lucy", label: "Lucy (101)" }
    setWalletInUse(activeChain, value.value);
    void (async function () {
      await localForage.setItem(`walletInUse-${activeChain}`, value.value);
    })();
  };

  const addWallet = () => {
    generateAddress();
  };

  const generateAddress = () => {
    try {
      // what wallet to generate?
      let path = '0-0';
      const existingWallets = Object.keys(wallets);
      let i = 0;
      while (existingWallets.includes(path)) {
        i++;
        path = '0-' + i;
      }
      const typeIndex = 0;
      const addressIndex = i;
      console.log(addressIndex);
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        activeChain,
      );
      setAddress(activeChain, path, addrInfo.address);
      setRedeemScript(activeChain, path, addrInfo.redeemScript);
      // get stored wallets
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem(`wallets-${activeChain}`)) ?? {};
        generatedWallets[path] = addrInfo.address;
        await localForage.setItem(`wallets-${activeChain}`, generatedWallets);
      })();
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

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
      dispatch(setSSPInitialState());
      setInitialStateForAllChains();
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
      {contextHolder}
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
            <Select
              labelInValue
              defaultValue={defaultWallet}
              style={{ width: 200 }}
              onChange={handleChange}
              options={walletItems}
              bordered={false}
              size="large"
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: '8px 0' }} />
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={addWallet}
                  >
                    {t('home:navbar.generate_new_wallet')}
                  </Button>
                </>
              )}
            />
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
      <AutoLogout />
    </>
  );
}

export default Navbar;
