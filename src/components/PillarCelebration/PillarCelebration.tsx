import './PillarCelebration.css';

/**
 * Pillar-assembly celebration — the onboarding completion moment.
 *
 * The three-pillar mark assembles into place (the same motif as
 * HandshakeAnimation's "approved" state), then the "ready" copy fades in.
 * CSS-only (no new deps), respects prefers-reduced-motion (static assembled
 * mark, no motion). Rendered as a full-surface overlay on top of the wizard
 * for a brief beat before the app navigates on.
 */

// Exact reconstructed logo geometry (viewBox 0 0 184 240) — shared with
// HandshakeAnimation. left #F59E0B, center (tallest) #FCD34D, right neutral.
const PILLAR_PATHS = [
  { d: 'M0 42v134l46 46V88z', className: 'pc-pillar-left' },
  { d: 'M69 0v194l46 46V46z', className: 'pc-pillar-center' },
  { d: 'M138 42v134l46 46V88z', className: 'pc-pillar-right' },
];

function PillarCelebration({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="pillar-celebration" role="status" aria-label={title}>
      <div className="pc-stage">
        <svg viewBox="0 0 184 240" className="pc-mark" aria-hidden="true">
          {PILLAR_PATHS.map((pillar) => (
            <path
              key={pillar.className}
              d={pillar.d}
              className={pillar.className}
            />
          ))}
        </svg>
        <span className="pc-ring" aria-hidden="true" />
      </div>
      <h2 className="pc-title">{title}</h2>
      {subtitle && <p className="pc-subtitle">{subtitle}</p>}
    </div>
  );
}

export default PillarCelebration;
