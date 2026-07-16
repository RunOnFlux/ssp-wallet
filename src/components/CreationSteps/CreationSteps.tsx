import { Steps } from 'antd';
import { useTranslation } from 'react-i18next';
import './CreationSteps.css';

/**
 * Onboarding wizard chrome. Goal-gradient (Phase 4): the progress readout
 * NEVER reads 0% — the first real step already shows ~22% so momentum is
 * visible from the start. The percent is presentational only; `step` still
 * drives which antd Steps node is active. A "Make it yours" personalization
 * node sits between Backup and Sync.
 */

// Non-zero at every stage — the wizard should always feel underway, never at 0.
const STEP_PERCENT: Record<number, number> = {
  0: 8,
  1: 22,
  2: 45,
  3: 70,
  4: 90,
};

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
          {t('common:make_it')}
          <br />
          {t('common:yours')}
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
  const percent = STEP_PERCENT[props.step] ?? 8;
  return (
    <>
      <div className="creation-progress" aria-hidden="true">
        <div className="creation-progress-track">
          <div
            className="creation-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="creation-progress-label">{percent}%</span>
      </div>
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
