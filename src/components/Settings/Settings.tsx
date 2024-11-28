import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Modal, Input, Space, message, Select } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import {
  backends,
  backendsOriginal,
  loadBackendsConfig,
} from '@storage/backends';
import { sspConfig, sspConfigOriginal, loadSSPConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { useAppSelector, useAppDispatch } from '../../hooks';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';
import { currency } from '../../types';
import { supportedFiatValues, getFiatSymbol } from '../../lib/currency.ts';
import { setFiatRates } from '../../store';

interface sspConfigType {
  relay?: string;
  fiatCurrency?: keyof currency;
}

function Settings(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const { activeChain } = useAppSelector((state) => state.sspState);
  const { fiatRates } = useAppSelector((state) => state.fiatCryptoRates);
  const { t } = useTranslation(['home', 'common']);
  const NC = backends()[activeChain].node;
  const SSPR = sspConfig().relay;
  const [sspConfigRelay, setSspConfigRelay] = useState(sspConfig().relay);
  const SSPFC = sspConfig().fiatCurrency;
  const [sspFiatCurrency, setSspFiatCurrency] = useState(SSPFC);
  const [nodeConfig, setNodeConfig] = useState(NC);
  const { open, openAction } = props;
  const [messageApi, contextHolder] = message.useMessage();
  const blockchainConfig = blockchains[activeChain];

  const backendsOriginalConfig = backendsOriginal();
  const originalConfig = sspConfigOriginal();

  useEffect(() => {
    setNodeConfig(NC);
  }, [activeChain]);

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = async () => {
    try {
      // adjust ssp
      const sspConf: sspConfigType = {};
      if (originalConfig.relay !== sspConfigRelay) {
        sspConf.relay = sspConfigRelay;
      }
      if (originalConfig.fiatCurrency !== sspFiatCurrency) {
        sspConf.fiatCurrency = sspFiatCurrency;
      }
      if (Object.keys(sspConf).length > 0) {
        await localForage.setItem('sspConfig', sspConf).catch((err) => {
          console.log(err);
        });
      } else {
        // remove if present on localForge
        await localForage.removeItem('sspConfig').catch((err) => {
          console.log(err);
        });
      }
      // adjust node
      const storedBackends: backends =
        (await localForage.getItem('backends')) ?? {};
      if (!storedBackends[activeChain]) {
        storedBackends[activeChain] = backendsOriginalConfig[activeChain];
      }
      if (storedBackends?.[activeChain]?.node !== nodeConfig) {
        storedBackends[activeChain].node = nodeConfig;
        console.log('adjusted');
        await localForage.setItem('backends', storedBackends).catch((err) => {
          console.log(err);
        });
      } else if (storedBackends?.[activeChain]?.node) {
        delete storedBackends?.[activeChain];
        if (Object.keys(storedBackends).length === 0) {
          // remove if present on localForge
          await localForage.removeItem('backends').catch((err) => {
            console.log(err);
          });
        } else {
          await localForage.setItem('backends', storedBackends).catch((err) => {
            console.log(err);
          });
        }
      }
      // apply configuration
      loadBackendsConfig();
      loadSSPConfig();
      openAction(false);
      // this is to trigger useEffect reloads on txs, balances by adjusting slightly fiatRates otherwise change of fiat currency won't have an effect for a while
      setTimeout(() => {
        dispatch(
          setFiatRates({ ...fiatRates, IDR: fiatRates.IDR + 0.0000000001 }),
        );
      }, 100);
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:settings.err_saving_conf'));
    }
  };

  const handleNotOk = () => {
    if (SSPR !== sspConfigRelay) {
      setSspConfigRelay(SSPR);
    }
    if (NC !== nodeConfig) {
      setNodeConfig(NC);
    }
    if (SSPFC !== sspFiatCurrency) {
      setSspFiatCurrency(SSPFC);
    }
    loadBackendsConfig();
    loadSSPConfig();
    openAction(false);
  };

  const resetSSP = () => {
    setSspConfigRelay(originalConfig.relay);
    setSspFiatCurrency(originalConfig.fiatCurrency);
  };

  const resetNodeConfig = () => {
    setNodeConfig(backendsOriginalConfig[activeChain].node);
  };

  const fiatOptions = () => {
    const fiatOptions = [];
    for (const fiat of supportedFiatValues) {
      fiatOptions.push({
        value: fiat,
        label: fiat,
        desc: getFiatSymbol(fiat) ? `${fiat} (${getFiatSymbol(fiat)})` : fiat,
      });
    }
    return fiatOptions;
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:settings.settings')}
        open={open}
        onCancel={handleNotOk}
        style={{ textAlign: 'center', top: 60, width: 200 }}
        footer={[]}
      >
        <h3>{t('home:settings.language')}</h3>
        <Space direction="vertical" size="large">
          <LanguageSelector label={true} />
        </Space>
        <h3>{t('home:settings.fiat_currency')}</h3>
        <Space direction="vertical" size="large">
          <Select
            popupMatchSelectWidth={false}
            suffixIcon={undefined}
            variant={'outlined'}
            value={sspFiatCurrency}
            optionLabelProp={'desc'}
            onChange={(value) => setSspFiatCurrency(value)}
            style={{ width: 'fit-content' }}
            dropdownStyle={{ minWidth: '130px' }}
            options={fiatOptions()}
            optionRender={(option) => <>{option.data.desc}</>}
          />
        </Space>
        <h3>{t('home:settings.change_pw')}</h3>
        <Space direction="vertical" size="large">
          <Button type="default" block size="middle" onClick={handleNotOk}>
            <Link to={'/restore'}>{t('home:settings.change_pw_restore')}</Link>
          </Button>
        </Space>
        <br />
        <br />
        <h3>{t('home:settings.ssp_relay')}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={originalConfig.relay}
            value={sspConfigRelay}
            onChange={(e) => setSspConfigRelay(e.target.value)}
          />
          <Button type="default" size="large" onClick={resetSSP}>
            {t('common:reset')}
          </Button>
        </Space.Compact>
        <h3>
          {t('home:settings.chain_node_service', {
            chain: blockchainConfig.name,
          })}
        </h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder={backendsOriginalConfig[activeChain].node}
            value={nodeConfig}
            onChange={(e) => setNodeConfig(e.target.value)}
          />
          <Button type="default" size="large" onClick={resetNodeConfig}>
            {t('common:reset')}
          </Button>
        </Space.Compact>
        <br />
        <br />
        <br />
        <br />
        <Space direction="vertical" size="large">
          <Button type="primary" size="large" onClick={handleOk}>
            {t('common:save')}
          </Button>
          <Button type="link" block size="small" onClick={handleNotOk}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Modal>
    </>
  );
}

export default Settings;
