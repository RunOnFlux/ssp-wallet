import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import { useAppDispatch } from '../../hooks';
import {
  setSSPInitialState,
  setInitialStateForAllChains,
  setPasswordBlobInitialState,
  setAddress,
  setRedeemScript,
  setWitnessScript,
  setWalletInUse,
  removeWallet,
  setNodes,
  setTransactions,
  setBalance,
  setUnconfirmedBalance,
  setInitialContactsState,
  setTokenBalances,
  setActivatedTokens,
  setImportedTokens,
} from '../../store';
import {
  Row,
  Col,
  Image,
  Menu,
  Select,
  Divider,
  Button,
  message,
  Popconfirm,
} from 'antd';
import {
  LockOutlined,
  SettingOutlined,
  PlusOutlined,
  MinusOutlined,
  NodeIndexOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import './Navbar.css';
import SspWalletDetails from '../SspWalletDetails/SspWalletDetails';
import AddressDetails from '../AddressDetails/AddressDetails';
import PasswordConfirm from '../PasswordConfirm/PasswordConfirm';
import ChainSelect from '../ChainSelect/ChainSelect';
import Settings from '../Settings/Settings';
import AutoLogout from '../AutoLogout/AutoLogout';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../hooks';
import { generateMultisigAddress } from '../../lib/wallet.ts';
import {
  generatedWallets,
  transaction,
  node,
  tokenBalanceEVM,
} from '../../types';
import { blockchains, Token } from '@storage/blockchains';
import ManualSign from '../ManualSign/ManualSign.tsx';

interface walletOption {
  value: string;
  label: string;
}

interface balancesObj {
  confirmed: string;
  unconfirmed: string;
}

const balancesObject = {
  confirmed: '0.00',
  unconfirmed: '0.00',
};

function Navbar(props: {
  refresh: () => void;
  hasRefresh: boolean;
  allowChainSwitch?: boolean;
}) {
  const { t } = useTranslation(['home', 'common']);
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { wallets, walletInUse, xpubKey, xpubWallet } = useAppSelector(
    (state) => state[activeChain],
  );
  const blockchainConfig = blockchains[activeChain];
  const [actionToPerform, setActionToPerform] = useState('');
  const [openSspWalletDetails, setOpenSspWalletDetails] = useState(false);
  const [openManualSign, setOpenManualSign] = useState(false);
  const [selectChainOpen, setSelectChainOpen] = useState(false);
  const [deletionToPerform, setDeletionToPerform] = useState('');
  const [defaultWallet, setWalletValue] = useState<walletOption>({
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
    console.log('chain change');
    const defValue = {
      value: walletInUse,
      label: t('home:navbar.chain_wallet', {
        chain: blockchainConfig.name,
        wallet:
          (+walletInUse.split('-')[0] === 1 ? 'Change ' : 'Wallet ') +
          (+walletInUse.split('-')[1] + 1),
      }),
    };
    setWalletValue(defValue);
  }, [activeChain]);

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
  }, [wallets, activeChain]);

  useEffect(() => {
    if (deletionToPerform && walletInUse && deletionToPerform !== walletInUse) {
      removeWallet(activeChain, deletionToPerform);
      // get stored wallets
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem(`wallets-${activeChain}`)) ?? {};
        delete generatedWallets[deletionToPerform];
        await localForage.setItem(`wallets-${activeChain}`, generatedWallets);
      })();
    }
  }, [deletionToPerform, walletInUse]);

  const handleChange = (value: { value: string; label: React.ReactNode }) => {
    generateAddress(value.value);
    void (async function () {
      // load txs, balances, settings etc.
      const txsWallet: transaction[] =
        (await localForage.getItem(
          `transactions-${activeChain}-${value.value}`,
        )) ?? [];
      const balancesWallet: balancesObj =
        (await localForage.getItem(`balances-${activeChain}-${value.value}`)) ??
        balancesObject;
      const tokenBalances: tokenBalanceEVM[] =
        (await localForage.getItem(
          `token-balances-${activeChain}-${value.value}`,
        )) ?? [];
      const activatedTokens: string[] =
        (await localForage.getItem(
          `activated-tokens-${activeChain}-${value.value}`,
        )) ?? [];
      const nodesWallet: node[] =
        (await localForage.getItem(`nodes-${activeChain}-${value.value}`)) ??
        [];
      const importedTokens: Token[] =
        (await localForage.getItem(`imported-tokens-${activeChain}`)) ?? [];
      if (importedTokens) {
        setImportedTokens(activeChain, importedTokens || []);
      }
      if (activatedTokens) {
        setActivatedTokens(activeChain, value.value, activatedTokens || []);
      }
      if (tokenBalances) {
        setTokenBalances(activeChain, value.value, tokenBalances || []);
      }
      if (nodesWallet) {
        setNodes(activeChain, value.value, nodesWallet || []);
      }
      if (txsWallet) {
        setTransactions(activeChain, value.value, txsWallet || []);
      }
      if (balancesWallet) {
        setBalance(activeChain, value.value, balancesWallet.confirmed);

        setUnconfirmedBalance(
          activeChain,
          value.value,
          balancesWallet.unconfirmed,
        );
      }
      await localForage.setItem(`walletInUse-${activeChain}`, value.value);
      setWalletValue(value as walletOption);
      setWalletInUse(activeChain, value.value);
    })();
  };

  const addWallet = () => {
    generateNewAddress();
  };

  const removeAddress = () => {
    try {
      // we always remove the LAST wallet only
      // if we are in that last wallet, we switch to wallet 0.
      // what wallet to remove?
      let path = '0-0';
      const existingWallets = Object.keys(wallets);
      let i = 0;
      while (existingWallets.includes(path)) {
        i++;
        path = '0-' + i;
      }
      const walletToRemoveIndex = i - 1;
      const pathToDelete = `0-${walletToRemoveIndex.toString()}`;
      if (walletToRemoveIndex <= 0) {
        // can't remove 0-0 wallet
        return;
      }
      // check if that is our activeIndex, if yes. Switch wallet.
      if (pathToDelete === walletInUse) {
        // switch
        const walletName = 'Wallet 1';
        const wal = {
          value: '0-0',
          label: t('home:navbar.chain_wallet', {
            chain: blockchainConfig.name,
            wallet: walletName,
          }),
        };
        handleChange(wal);
      }
      setDeletionToPerform(pathToDelete);
    } catch (error) {
      console.log(error);
    }
  };

  const generateNewAddress = () => {
    try {
      // what wallet to generate?
      let path = '0-0';
      const existingWallets = Object.keys(wallets);
      let i = 0;
      while (existingWallets.includes(path)) {
        i++;
        path = '0-' + i;
      }
      if (i > 41) {
        // max 42 wallets
        displayMessage('error', t('home:navbar.max_wallets'));
        return;
      }
      generateAddress(path);
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const generateAddress = (path: string) => {
    try {
      const splittedDerPath = path.split('-');
      const typeIndex = Number(splittedDerPath[0]) as 0 | 1;
      const addressIndex = Number(splittedDerPath[1]);
      const addrInfo = generateMultisigAddress(
        xpubWallet,
        xpubKey,
        typeIndex,
        addressIndex,
        activeChain,
      );
      setAddress(activeChain, path, addrInfo.address);
      setRedeemScript(activeChain, path, addrInfo.redeemScript ?? '');
      setWitnessScript(activeChain, path, addrInfo.witnessScript ?? '');
      // get stored path
      void (async function () {
        const generatedWallets: generatedWallets =
          (await localForage.getItem('wallets-' + activeChain)) ?? {};
        generatedWallets[path] = addrInfo.address;
        await localForage.setItem('wallets-' + activeChain, generatedWallets);
        // balances, transactions are refreshed automatically
      })();
    } catch (error) {
      // if error, key is invalid! we should never end up here as it is validated before
      displayMessage('error', t('home:err_panic'));
      console.log(error);
    }
  };

  const sspIdentityAction = (status: boolean) => {
    setOpenManualSign(status);
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
  const selectChainAction = (status: boolean) => {
    setSelectChainOpen(status);
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
    if (e.key === 'refresh') props.refresh();
    if (e.key === 'Lock') logout();
    if (e.key === 'address') {
      setPasswordConfirmDialogVisible(true);
      setActionToPerform('address');
    }
    if (e.key === 'sspwallet') {
      setPasswordConfirmDialogVisible(true);
      setActionToPerform('sspwallet');
    }
    if (e.key === 'manualsign') setOpenManualSign(true);
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
      setInitialStateForAllChains();
      dispatch(setSSPInitialState());
      dispatch(setInitialContactsState());
      dispatch(setPasswordBlobInitialState());
      navigate('/login');
    })();
  };

  const selectChain = () => {
    setSelectChainOpen(true);
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
      children: props.hasRefresh
        ? [
            {
              label: t('home:navbar.addr_details'),
              key: 'address',
            },
            {
              label: t('home:navbar.ssp_details'),
              key: 'sspwallet',
            },
            {
              label: t('home:navbar.ssp_message_sign'),
              key: 'manualsign',
            },
            {
              label: t('home:settings.settings'),
              key: 'settings',
            },
            {
              label: t('home:navbar.refresh'),
              key: 'refresh',
            },
          ]
        : [
            {
              label: t('home:navbar.addr_details'),
              key: 'address',
            },
            {
              label: t('home:navbar.ssp_details'),
              key: 'sspwallet',
            },
            {
              label: t('home:navbar.ssp_message_sign'),
              key: 'manualsign',
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
              src="/ssp-logo-black.svg"
              onClick={() => navigate('/home')}
              style={{ cursor: 'pointer' }}
            />
          </Col>
          <Col span={16} style={{ fontSize: '16px', lineHeight: '36px' }}>
            <Select
              labelInValue
              value={defaultWallet}
              style={{ width: 200 }}
              onChange={handleChange}
              options={walletItems}
              variant={'borderless'}
              size="large"
              dropdownStyle={{ zIndex: 9 }}
              dropdownRender={(menu) => (
                <>
                  <div
                    style={{
                      lineHeight: '25px',
                      marginBottom: '10px',
                      marginLeft: '10px',
                    }}
                  >
                    <Image
                      height={22}
                      preview={false}
                      src={blockchainConfig.logo}
                      style={{ cursor: 'pointer' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '5px',
                        marginLeft: '8px',
                        fontSize: '16px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {blockchainConfig.name}{' '}
                      {blockchainConfig.name.includes(' ')
                        ? ''
                        : t('common:chain')}
                    </span>
                  </div>
                  {menu}
                  {props.allowChainSwitch && (
                    <>
                      <Divider style={{ margin: '8px 0' }} />
                      <Button
                        type="text"
                        icon={<PlusOutlined />}
                        onClick={addWallet}
                        style={{ width: '100%', textAlign: 'left' }}
                      >
                        {t('home:navbar.generate_new_wallet')}
                      </Button>
                      {walletItems.length > 1 && (
                        <Popconfirm
                          title={t('home:navbar.remove_last_wallet')}
                          description={
                            <>{t('home:navbar.remove_last_wallet_desc')}</>
                          }
                          overlayStyle={{ maxWidth: 360, margin: 10 }}
                          okText={t('home:navbar.remove')}
                          cancelText={t('common:cancel')}
                          onConfirm={() => {
                            removeAddress();
                          }}
                          icon={
                            <QuestionCircleOutlined style={{ color: 'blue' }} />
                          }
                        >
                          <Button
                            type="text"
                            icon={<MinusOutlined />}
                            style={{ width: '100%', textAlign: 'left' }}
                          >
                            {t('home:navbar.remove_last_wallet')}
                          </Button>
                        </Popconfirm>
                      )}
                      <Divider style={{ margin: '8px 0' }} />
                      <Button
                        type="text"
                        style={{ width: '100%', textAlign: 'left' }}
                        icon={<NodeIndexOutlined />}
                        onClick={() => selectChain()}
                      >
                        {t('home:navbar.switch_chain')}
                      </Button>
                    </>
                  )}
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
      <ManualSign open={openManualSign} openAction={sspIdentityAction} />
      <PasswordConfirm
        open={passwordConfirmDialogVisilbe}
        openAction={passwordConfirmDialogAction}
      />
      <Settings
        open={openSettingsDialogVisilbe}
        openAction={settingsDialogAction}
      />
      <ChainSelect open={selectChainOpen} openAction={selectChainAction} />
      <AutoLogout />
    </>
  );
}

Navbar.defaultProps = {
  allowChainSwitch: true,
};

export default Navbar;
