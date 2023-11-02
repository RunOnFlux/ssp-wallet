import { Image } from 'antd';

interface Props {
  isClickeable?: boolean;
}
function PoweredByFlux({ isClickeable = false }: Props) {
  const theme = 'dark';
  const bgColor: string = theme === 'dark' ? '#fff' : '#000';

  const image = `/powered_by_${theme}.svg`;

  const open = (url: string) => {
    window.open(url, '_blank');
  };
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        marginLeft: 'auto',
        marginRight: 'auto',
        zIndex: 1000,
        left: 0,
        right: 0,
        textAlign: 'center',
        boxShadow: '0 -7px 7px -7px #ddd',
        padding: 10,
        paddingBottom: 14,
        backgroundColor: bgColor,
      }}
    >
      {isClickeable && (
        <Image
          height={18}
          preview={false}
          src={image}
          onClick={() => open('https://runonflux.io')}
          style={{ cursor: 'pointer' }}
        />
      )}
      {!isClickeable && (
        <Image
          height={18}
          preview={false}
          src={image}
        />
      )}
    </div>
  );
}

PoweredByFlux.defaultProps = {
  isClickeable: false,
};

export default PoweredByFlux;
