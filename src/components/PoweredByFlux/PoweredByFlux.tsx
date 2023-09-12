import { useTranslation } from 'react-i18next';
import './PoweredByFlux.css';

function PoweredByFlux() {
  const { t } = useTranslation(['common']);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 10,
        marginLeft: 'auto',
        marginRight: 'auto',
        left: 0,
        right: 0,
        textAlign: 'center',
      }}
    >
      {t('common:powered_by')}{' '}
      <a
        className="aLink"
        href={'https://runonflux.io'}
        target="_blank"
        rel="noreferrer"
      >
        {t('common:flux')}
      </a>
    </div>
  );
}

export default PoweredByFlux;
