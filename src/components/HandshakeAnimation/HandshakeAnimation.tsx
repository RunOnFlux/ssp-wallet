import type { CSSProperties } from 'react';
import './HandshakeAnimation.css';

/**
 * The 2-of-2 handshake motif — the brand's signature moment.
 *
 * A wallet-shaped frame (this device) and a phone-shaped frame (SSP Key)
 * with the three-pillar mark passing between them while a co-signature is
 * awaited. CSS-only (like PillarLoader): no new dependencies, respects
 * prefers-reduced-motion (static frames, the accompanying status timeline
 * carries the state in text).
 *
 * Pillar geometry is the exact reconstructed logo geometry
 * (public/ssp-logo-*.svg): 45° parallelograms, left #F59E0B, center
 * (tallest) #FCD34D, right theme-neutral (dark on light / light on dark,
 * via [data-theme] in CSS — same pattern as PillarLoader).
 */

export type HandshakeState = 'waiting' | 'approved' | 'rejected';

// Exact paths from the reconstructed logo (viewBox 0 0 184 240).
const PILLAR_PATHS = [
  { d: 'M0 42v134l46 46V88z', className: 'hs-pillar-left' },
  { d: 'M69 0v194l46 46V46z', className: 'hs-pillar-center' },
  { d: 'M138 42v134l46 46V88z', className: 'hs-pillar-right' },
];

function PillarMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 184 240" className={className} aria-hidden="true">
      {PILLAR_PATHS.map((pillar) => (
        <path
          key={pillar.className}
          d={pillar.d}
          className={pillar.className}
        />
      ))}
    </svg>
  );
}

function HandshakeAnimation({
  state,
  size = 84,
  ariaLabel,
}: {
  state: HandshakeState;
  /** overall height of the composition in px */
  size?: number;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`handshake handshake-${state}`}
      style={{ '--hs-size': `${size}px` } as CSSProperties}
      role="status"
      aria-label={ariaLabel}
    >
      {/* wallet-shaped frame — this device */}
      <div className="hs-device hs-wallet" aria-hidden="true">
        <span className="hs-wallet-bar" />
        <PillarMark className="hs-device-mark" />
      </div>
      <div className="hs-track" aria-hidden="true">
        <span className="hs-track-line" />
        {/* mini mark traveling wallet → phone while waiting */}
        <PillarMark className="hs-traveler" />
        {/* full mark assembling at center on approval */}
        <span className="hs-status-ring" />
        <PillarMark className="hs-center-mark" />
      </div>
      {/* phone-shaped frame — the SSP Key */}
      <div className="hs-device hs-phone" aria-hidden="true">
        <span className="hs-phone-notch" />
        <PillarMark className="hs-device-mark" />
      </div>
    </div>
  );
}

export default HandshakeAnimation;
