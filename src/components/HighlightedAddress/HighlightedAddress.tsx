import { theme } from 'antd';
import { splitAddressForDisplay } from '../../lib/addressDisplay';

/**
 * The FULL address with its middle highlighted (TRON_SSP_CONTRACT.md §5.8).
 * Address-poisoning lookalikes copy the first and last few characters, so the
 * middle is exactly where a lookalike differs. Nothing is hidden: the whole
 * address stays readable and copyable.
 */
function HighlightedAddress({
  address,
  edge = 4,
}: {
  address: string;
  edge?: number;
}) {
  const { token } = theme.useToken();
  const parts = splitAddressForDisplay(address, edge);
  return (
    <span
      className="highlighted-address"
      style={{ fontFamily: 'var(--ssp-mono)', wordBreak: 'break-all' }}
    >
      {parts.start}
      {parts.middle ? (
        <mark
          style={{
            background: token.colorWarningBg,
            color: token.colorText,
            fontWeight: 600,
            padding: 0,
            borderRadius: 2,
          }}
        >
          {parts.middle}
        </mark>
      ) : null}
      {parts.end}
    </span>
  );
}

export default HighlightedAddress;
