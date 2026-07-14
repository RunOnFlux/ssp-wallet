import './PillarLoader.css';

/**
 * Branded loading indicator: the three SSP pillars rising in sequence.
 * The right pillar is theme-neutral like the logo (dark on light, light on
 * dark) — handled in CSS via [data-theme]. Respects prefers-reduced-motion.
 */
function PillarLoader({ size = 40 }: { size?: number }) {
  return (
    <div
      className="pillar-loader"
      style={{ height: size, width: size * 0.77 }}
      role="status"
      aria-label="Loading"
    >
      <span className="pillar-loader-bar pillar-left" />
      <span className="pillar-loader-bar pillar-center" />
      <span className="pillar-loader-bar pillar-right" />
    </div>
  );
}

export default PillarLoader;
