import './PoweredByFlux.css';

function PoweredByFlux() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 10,
        marginLeft: 'auto',
        marginRight: 'auto',
        left: 0,
        right: 0,
        textAlign: 'center',
      }}
    >
      Powered by{' '}
      <a
        className="aLink"
        href={'https://runonflux.io'}
        target="_blank"
        rel="noreferrer"
      >
        Flux
      </a>
    </div>
  );
}

export default PoweredByFlux;
