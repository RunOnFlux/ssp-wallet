import { Typography, Button, Space, Modal, Select } from 'antd';
const { Text } = Typography;
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import { generatedWallets } from '../../types';

interface addressesInfoData {
  status: string;
  data?: string;
  chains?: chainsInfo[];
}

interface chainsInfo {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  chainId?: string;
  addresses: string[];
}

interface Props {
  open: boolean;
  openAction: (data: addressesInfoData | null) => void;
}

function AllAddressesInfo({ open, openAction }: Props) {
  const { t } = useTranslation(['home', 'common', 'cr']);

  const [approvedAddresses, setApprovedAddresses] = useState<string[]>([]);
  const [options, setOptions] = useState<
    {
      label: string;
      title: string;
      options: { label: string; value: string }[];
    }[]
  >([]);

  useEffect(() => {
    const fetchAddresses = async () => {
      const allBlockchainsInfo: chainsInfo[] = [];
      for (const chain in blockchains) {
        const chainInfo: chainsInfo = {
          id: chain,
          name: blockchains[chain].name,
          symbol: blockchains[chain].symbol,
          decimals: blockchains[chain].decimals,
          addresses: [],
        };
        const generatedWallets: generatedWallets =
          (await localForage.getItem(`wallets-${chain}`)) ?? {};
        const addressesKeys = Object.keys(generatedWallets);
        for (const address of addressesKeys) {
          chainInfo.addresses.push(generatedWallets[address]);
        }
        if (chainInfo.addresses.length) {
          allBlockchainsInfo.push(chainInfo);
        }
      }
      setOptions(
        allBlockchainsInfo.map((chainInfo) => ({
          label: chainInfo.name + ' (' + chainInfo.symbol + ')',
          title: chainInfo.name + ' (' + chainInfo.symbol + ')',
          options: chainInfo.addresses.map((address, i) => ({
            label: `${chainInfo.symbol} Wallet ${i + 1}: ${address}`,
            value: `${chainInfo.id}:${address}`,
          })),
        })),
      );
    };
    fetchAddresses();
  }, []);

  const handleOk = () => {
    try {
      const chainsInformationToSend: chainsInfo[] = [];
      const chainsMap: { [key: string]: chainsInfo } = {};
      approvedAddresses.forEach((addr) => {
        const [chainId, address] = addr.split(':');
        if (!chainsMap[chainId]) {
          const chainInfo: chainsInfo = {
            id: chainId,
            name: blockchains[chainId].name,
            symbol: blockchains[chainId].symbol,
            decimals: blockchains[chainId].decimals,
            addresses: [],
          };
          if (blockchains[chainId].chainId) {
            chainInfo.chainId = blockchains[chainId].chainId;
          }
          chainInfo.addresses.push(address);
          chainsMap[chainId] = chainInfo;
        } else {
          chainsMap[chainId].addresses.push(address);
        }
      });
      Object.values(chainsMap).forEach((chainInfo) => {
        chainsInformationToSend.push(chainInfo);
      });
      openAction({
        status: 'SUCCESS', // do not translate
        chains: chainsInformationToSend,
      });

      setApprovedAddresses([]);
    } catch (error) {
      console.log(error);
      openAction({
        status: 'ERROR', // do not translate
        data: t('home:addressesInfo.addresses_requests_info_error'),
      });
      setApprovedAddresses([]);
    }
  };

  const handleApprovedAddressesChange = (value: string[]) => {
    setApprovedAddresses(value);
  };

  const handleCancel = () => {
    openAction(null);
    setApprovedAddresses([]);
  };

  return (
    <>
      <Modal
        title={t('home:addressesInfo.addresses_requests')}
        open={open}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleCancel}
        footer={[]}
      >
        <Space
          direction="vertical"
          size="middle"
          style={{ marginBottom: 16, marginTop: 16 }}
        >
          <Space direction="vertical" size="small">
            <Text>{t('home:addressesInfo.addresses_requests_info_all')}</Text>
          </Space>
          <Select
            mode="multiple"
            allowClear
            style={{ width: '300px' }}
            placeholder={t('home:addressesInfo.select_addresses')}
            defaultValue={[]}
            onChange={handleApprovedAddressesChange}
            value={approvedAddresses}
            options={options}
          />
          <Space direction="vertical" size="large" style={{ marginTop: 16 }}>
            <Button
              type="primary"
              size="large"
              onClick={handleOk}
              disabled={!approvedAddresses.length}
            >
              {t('common:approve_request')}
            </Button>
            <Button type="link" block size="small" onClick={handleCancel}>
              {t('common:reject_request')}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

export default AllAddressesInfo;
