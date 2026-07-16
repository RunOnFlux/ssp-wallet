import { Checkbox, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { NamedDelegate } from './ConfigureDelegates';
import { truncateAddress } from '../../lib/addressDisplay';

const { Text } = Typography;

// Checkbox list letting the user pick which configured delegates to apply when
// starting a node. Renders nothing when no delegates are configured. The parent
// owns `selectedKeys` (default to all keys for "default to all" behaviour).
function SelectDelegates(props: {
  delegates: NamedDelegate[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  const { t } = useTranslation(['home']);

  if (props.delegates.length === 0) {
    return null;
  }

  const toggle = (key: string, checked: boolean) => {
    if (checked) {
      props.onChange([...props.selectedKeys, key]);
    } else {
      props.onChange(props.selectedKeys.filter((k) => k !== key));
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('home:nodesTable.select_delegates')}
      </Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {props.delegates.map((d, index) => (
          <Checkbox
            key={d.key}
            checked={props.selectedKeys.includes(d.key)}
            onChange={(e) => toggle(d.key, e.target.checked)}
          >
            <Text>
              {d.name || t('home:nodesTable.delegate_n', { index: index + 1 })}
            </Text>{' '}
            <Text
              type="secondary"
              style={{ fontSize: 11, fontFamily: 'var(--ssp-mono)' }}
            >
              {truncateAddress(d.key)}
            </Text>
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

export default SelectDelegates;
