import { Steps } from 'antd';
import { useTranslation } from 'react-i18next';
import './CreationSteps.css';

/**
 * Onboarding wizard chrome. The progress readout uses clean, 0/5-ending values
 * (25 / 50 / 75 / 90) so it always reads nicely. Only steps 1–4 are ever
 * rendered — "Get Started" is the pre-wizard Welcome screen — so the readout
 * runs 25 → 50 → 75 → 90; the final Sync step holds at 90% (100% is reserved
 * for actual completion, not merely landing on the last step). The percent is
 * presentational only; `step` still drives which antd Steps node is active. A
 * "Make it yours" personalization node sits between Backup and Sync.
 */

// Clean 0/5-ending readout; never 0% in practice (step 0 is never rendered).
const STEP_PERCENT: Record<number, number> = {
  0: 25,
  1: 25,
  2: 50,
  3: 75,
  4: 90,
};

function CreationSteps(props: { step: number; import: boolean }) {
  const { t } = useTranslation(['cr']);
  // One whole-phrase key per node — never single words joined by <br/>, which
  // only reads as a sentence in English. The labels wrap inside their own cell;
  // `whiteSpace: normal` guards against an inherited nowrap.
  const labels = [
    t('cr:steps.get_started'),
    props.import ? t('cr:steps.import_wallet') : t('cr:steps.create_password'),
    t('cr:steps.backup_wallet'),
    // Reuses the personalize modal's own title so the two can never drift.
    t('cr:personalize.title'),
    t('cr:steps.sync_key'),
  ];
  const items = labels.map((label) => ({
    title: (
      <div style={{ lineHeight: '18px', whiteSpace: 'normal' }}>{label}</div>
    ),
  }));
  const percent = STEP_PERCENT[props.step] ?? 25;
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
