import { Button, Modal, Select } from 'antd';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import localForage from 'localforage';
import { blockchains } from '@storage/blockchains';
import { truncateAddress } from '../../lib/addressDisplay';
import { getDisplayName } from '../../storage/walletNames';
import { generatedWallets, cryptos } from '../../types';
import '../DappRequest/DappRequest.css';

interface addressesInfoData {
  status: string;
  data?: string;
  addresses?: string[];
}

interface Props {
  open: boolean;
  chain: string;
  openAction: (data: addressesInfoData | null) => void;
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
      const generatedWallets: generatedWallets =
        (await localForage.getItem(`wallets-${chain}`)) ?? {};
      setOptions(
        Object.entries(generatedWallets).map(([derivation, address]) => ({
          label: `${getDisplayName(chain as keyof cryptos, derivation)}: ${truncateAddress(address)}`,
          value: address,
        })),
      );
    };
    fetchAddresses();
  }, [chain]);

  const handleOk = () => {
    try {
      if (!chain) {
        openAction({
          status: 'ERROR', // do not translate
          data: t('home:tokensInfo.chain_not_specified'),
        });
        setApprovedAddresses([]);
        return;
      }
      const chainInfo = blockchains[chain];
      if (!chainInfo) {
        openAction({
          status: 'ERROR', // do not translate
          data: t('home:tokensInfo.chain_not_supported'),
        });
        setApprovedAddresses([]);
        return;
      }
      openAction({
        status: 'SUCCESS', // do not translate
        addresses: approvedAddresses,
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
        onCancel={handleCancel}
        footer={[]}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginTop: 16,
          }}
        >
          <p className="dapp-ask">
            {t('home:addressesInfo.addresses_requests_info', {
              chain: blockchains[chain]?.name,
            })}
          </p>
          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%', textAlign: 'left' }}
            placeholder={t('home:addressesInfo.select_addresses')}
            defaultValue={[]}
            onChange={handleApprovedAddressesChange}
            value={approvedAddresses}
            options={options}
            aria-label={t('home:addressesInfo.select_addresses')}
          />
          <div className="dapp-actions">
            <Button
              type="primary"
              size="large"
              block
              onClick={handleOk}
              disabled={!approvedAddresses.length}
            >
              {t('common:approve_request')}
            </Button>
            <Button type="text" block onClick={handleCancel}>
              {t('common:reject_request')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default AddressesInfo;
