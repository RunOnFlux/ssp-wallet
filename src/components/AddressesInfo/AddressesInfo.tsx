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
  addresses?: string[];
}

interface Props {
  open: boolean;
  chain: string;
  openAction?: (data: addressesInfoData | null) => void;
}

function AddressesInfo({ open, chain, openAction }: Props) {
  const { t } = useTranslation(['home', 'common', 'cr']);

  const [approvedAddresses, setApprovedAddresses] = useState<string[]>([]);
  const [options, setOptions] = useState<{ label: string; value: string }[]>(
    [],
  );

  useEffect(() => {
    const fetchAddresses = async () => {
      if (!chain) {
        return;
      }
      const chainInfo = blockchains[chain];
      if (!chainInfo) {
        return;
      }
      const addresses: string[] = [];
      const generatedWallets: generatedWallets =
        (await localForage.getItem(`wallets-${chain}`)) ?? {};
      const addressesKeys = Object.keys(generatedWallets);
      for (const address of addressesKeys) {
        addresses.push(generatedWallets[address]);
      }
      setOptions(
        addresses.map((address, i) => ({
          label: `Wallet ${i + 1}: ${address.substring(0, 10)}...${address.substring(address.length - 9)}`,
          value: address,
        })),
      );
    };
    fetchAddresses();
  }, [chain]);

  const handleOk = () => {
    try {
      if (!chain) {
        if (openAction) {
          openAction({
            status: t('common:error'),
            data: t('home:tokensInfo.chain_not_specified'),
          });
        }
        return;
      }
      const chainInfo = blockchains[chain];
      if (!chainInfo) {
        if (openAction) {
          openAction({
            status: t('common:error'),
            data: t('home:tokensInfo.chain_not_supported'),
          });
        }
        return;
      }
      if (openAction) {
        openAction({
          status: t('common:success'),
          addresses: approvedAddresses,
        });
      }
    } catch (error) {
      console.log(error);
      if (openAction) {
        openAction({
          status: t('common:error'),
          data: t('home:addressesInfo.addresses_requests_info_error'),
        });
      }
    }
  };

  const handleApprovedAddressesChange = (value: string[]) => {
    setApprovedAddresses(value);
  };

  const handleCancel = () => {
    if (openAction) {
      openAction(null);
    }
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
            <Text>
              {t('home:addressesInfo.addresses_requests_info', {
                chain: blockchains[chain]?.name,
              })}
            </Text>
          </Space>
          <Select
            mode="multiple"
            allowClear
            style={{ width: '300px' }}
            placeholder={t('home:addressesInfo.select_addresses')}
            defaultValue={[]}
            onChange={handleApprovedAddressesChange}
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

export default AddressesInfo;
