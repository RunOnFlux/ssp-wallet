import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import secureLocalStorage from 'react-secure-storage';
import { Button, Image, Space, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import './Welcome.css';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';
import FloatingHelp from '../../components/FloatingHelp/FloatingHelp.tsx';

function Welcome() {
  const { t } = useTranslation(['welcome', 'common']);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    // if user exists, navigate to login
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
    setIsLoading(false);
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <>
      {isLoading && <Spin size="large" />}
      {!isLoading && (
        <div style={{ paddingBottom: '43px' }}>
          <Image
            width={120}
            preview={false}
            src="/ssp-logo-black.svg"
            style={{ paddingTop: 70 }}
          />
          <h1>{t('welcome:welcome_to')}</h1>
          <p className="welcome-text">
            {t('welcome:description')}
            <br />
            <br />
            {t('common:appName.moto')}
          </p>
          <Space direction="vertical" size="large">
            <Button type="primary" size="large">
              <Link to={'/create'}>{t('welcome:get_started')}</Link>
            </Button>
            <Button type="link" block size="small">
              <Link to={'/restore'}>{t('welcome:restore_with_seed')}</Link>
            </Button>
          </Space>
        </div>
      )}
      <PoweredByFlux isClickeable={true} />
      <div style={{ position: 'absolute', top: 6, right: 6 }}>
        <LanguageSelector label={false} />
      </div>
      <FloatingHelp showGuide={true} />
    </>
  );
}

export default Welcome;
