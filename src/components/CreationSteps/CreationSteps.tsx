import { Steps } from 'antd';
import { useTranslation } from 'react-i18next';
import './CreationSteps.css';

function CreationSteps(props: { step: number; import: boolean }) {
  const { t } = useTranslation(['common']);
  const items = [
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {t('common:get')}
          <br />
          {t('common:started')}
        </div>
      ),
    },
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {props.import ? t('common:import') : t('common:create')}
          <br />
          {props.import ? t('common:wallet') : t('common:password')}
        </div>
      ),
    },
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {t('common:backup')}
          <br />
          {t('common:wallet')}
        </div>
      ),
    },
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {t('common:sync')}
          <br />
          {t('common:ssp_key')}
        </div>
      ),
    },
  ];
  return (
    <>
      <Steps
        current={props.step}
        labelPlacement="vertical"
        items={items}
        size="small"
        direction="horizontal"
        responsive={false}
        className="creation-steps"
      />
    </>
  );
}

export default CreationSteps;
