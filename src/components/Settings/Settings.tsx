/* eslint-disable @typescript-eslint/no-misused-promises */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Modal, Input, Space, message } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import localForage from 'localforage';
import {
  backends,
  backendsOriginal,
  loadBackendsConfig,
} from '@storage/backends';
import { sspConfig, sspConfigOriginal, loadSSPConfig } from '@storage/ssp';
import { useTranslation } from 'react-i18next';

const backendsOriginalConfig = backendsOriginal();
const originalConfig = sspConfigOriginal();

function PasswordConfirm(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const FNC = backends().flux.node;
  const SSPR = sspConfig().relay;
  const [sspConfigRelay, setSspConfigRelay] = useState(SSPR);
  const [fluxNodeConfig, setFluxNodeConfig] = useState(FNC);
  const { open, openAction } = props;
  const [messageApi, contextHolder] = message.useMessage();

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  const handleOk = async () => {
    try {
      // adjust ssp
      if (originalConfig.relay !== sspConfigRelay) {
        const sspConf = {
          relay: sspConfigRelay,
        };
        await localForage.setItem('sspConfig', sspConf).catch((err) => {
          console.log(err);
        });
      } else {
        // remove if present on localForge
        await localForage.removeItem('sspConfig').catch((err) => {
          console.log(err);
        });
      }
      // adjust flux node
      if (backendsOriginalConfig.flux.node !== fluxNodeConfig) {
        const backendsConfig = {
          flux: {
            node: fluxNodeConfig,
          },
        };
        console.log('adjusted');
        await localForage.setItem('backends', backendsConfig).catch((err) => {
          console.log(err);
        });
      } else {
        // remove if present on localForge
        await localForage.removeItem('backends').catch((err) => {
          console.log(err);
        });
      }
      // apply configuration
      loadBackendsConfig();
      loadSSPConfig();
      openAction(false);
    } catch (error) {
      console.log(error);
      displayMessage('error', t('home:settings.err_saving_conf'));
    }
  };

  const handleNotOk = () => {
    if (SSPR !== sspConfigRelay) {
      setSspConfigRelay(SSPR);
    }
    if (FNC !== fluxNodeConfig) {
      setFluxNodeConfig(FNC);
    }
    loadBackendsConfig();
    loadSSPConfig();
    openAction(false);
  };

  const resetSSP = () => {
    setSspConfigRelay(originalConfig.relay);
  };

  const resetFlux = () => {
    setFluxNodeConfig(backendsOriginalConfig.flux.node);
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
            placeholder="relay.ssp.runonflux.io"
            value={sspConfigRelay}
            onChange={(e) => setSspConfigRelay(e.target.value)}
          />
          <Button type="default" size="large" onClick={resetSSP}>
            {t('common:reset')}
          </Button>
        </Space.Compact>
        <h3>{t('home:settings.chain_node_service', { chain: 'Flux' })}</h3>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder="explorer.runonflux.io"
            value={fluxNodeConfig}
            onChange={(e) => setFluxNodeConfig(e.target.value)}
          />
          <Button type="default" size="large" onClick={resetFlux}>
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

export default PasswordConfirm;
