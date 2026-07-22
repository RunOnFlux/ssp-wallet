import { identiconData, IDENTICON_GRID } from '../../lib/identicon';

interface IdenticonProps {
  /** Identity string (address, wkIdentity, xpub, ...). */
  value: string;
  /** Square size in px. */
  size?: number;
}

/**
 * Deterministic identicon — 5x5 symmetric grid derived from the identity
 * string (see lib/identicon.ts). The same identity always renders the same
 * pattern on the phone (ssp-key), the enterprise app and here, giving a fast
 * cross-device "is this the address I expect?" check. Decorative: hidden
 * from assistive tech (the address text next to it carries meaning).
 */
export function Identicon({ value, size = 24 }: IdenticonProps) {
  const { color, cells } = identiconData(value);
  const padding = Math.round(size * 0.12);
  const cellSize = (size - padding * 2) / IDENTICON_GRID;
  return (
    <span
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        overflow: 'hidden',
        flexShrink: 0,
        backgroundColor: 'rgba(128, 128, 128, 0.12)',
        verticalAlign: 'middle',
      }}
      aria-hidden="true"
      data-testid="identicon"
    >
      <svg width={size} height={size}>
        {cells.map((active, index) =>
          active ? (
            <rect
              key={index}
              x={padding + (index % IDENTICON_GRID) * cellSize}
              y={padding + Math.floor(index / IDENTICON_GRID) * cellSize}
              width={cellSize}
              height={cellSize}
              fill={color}
            />
          ) : null,
        )}
      </svg>
    </span>
  );
}

export default Identicon;
