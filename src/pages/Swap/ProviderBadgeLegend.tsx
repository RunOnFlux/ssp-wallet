import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { SWAP_BADGES, knownBadges } from '../../lib/swapBadges';

// Says in words what the badges on screen mean: under the provider list, and
// for the chosen provider above Continue — where "a ZK swap can take more than
// an hour" has to be read before the user commits, not discovered after.
function ProviderBadgeLegend(props: { tags: (string | undefined)[] }) {
  const { t } = useTranslation(['home']);
  const badges = knownBadges(props.tags);
  if (!badges.length) return null;
  return (
    <div
      className="provider-badge-legend"
      aria-label={t('home:swap.badges_title')}
    >
      {badges.map((badge) => (
        <div key={badge} className="provider-badge-legend-row">
          <Tag color={SWAP_BADGES[badge].color} bordered={false}>
            {t(SWAP_BADGES[badge].label)}
          </Tag>
          <span>{t(SWAP_BADGES[badge].info)}</span>
        </div>
      ))}
    </div>
  );
}

export default ProviderBadgeLegend;
