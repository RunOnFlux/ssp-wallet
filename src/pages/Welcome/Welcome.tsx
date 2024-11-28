import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import secureLocalStorage from 'react-secure-storage';
import { Button, Image, Space, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import './Welcome.css';
import PoweredByFlux from '../../components/PoweredByFlux/PoweredByFlux.tsx';
import LanguageSelector from '../../components/LanguageSelector/LanguageSelector.tsx';

function Welcome() {
  const { t } = useTranslation(['welcome', 'common']);
  const alreadyMounted = useRef(false); // as of react strict mode, useEffect is triggered twice. This is a hack to prevent that without disabling strict mode
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;
    // if user exists, navigate to login
    const accPresent = secureLocalStorage.getItem('walletSeed');
    if (accPresent) {
      navigate('/login');
      return;
    }
    setIsLoading(false);
  });

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
      <div style={{ position: 'absolute', top: 5, right: 5 }}>
        <LanguageSelector label={false} />
      </div>
    </>
  );
}

export default Welcome;
