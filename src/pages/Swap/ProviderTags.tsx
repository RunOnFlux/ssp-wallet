import { Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { SWAP_BADGES, knownBadges } from '../../lib/swapBadges';

function ProviderTags(props: { tags?: string[] }) {
  const { t } = useTranslation(['home']);
  const badges = knownBadges(props.tags ?? []);
  if (!badges.length) return null;
  return (
    <span className="provider-tags">
      {badges.map((badge) => (
        <Tooltip key={badge} title={t(SWAP_BADGES[badge].info)}>
          <Tag color={SWAP_BADGES[badge].color} variant="filled">
            {t(SWAP_BADGES[badge].label)}
          </Tag>
        </Tooltip>
      ))}
    </span>
  );
}

export default ProviderTags;
