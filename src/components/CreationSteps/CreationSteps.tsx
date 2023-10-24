import { Steps, ConfigProvider } from 'antd';
import './CreationSteps.css';

function CreationSteps(props: { step: number, import: boolean }) {
  const items = [
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {'Get'}
          <br />
          {'Started!'}
        </div>
      ),
    },
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {props.import ? 'Import' : 'Create'}  
          <br />
          {props.import ? 'Wallet' : 'Password'}
        </div>
      ),
    },
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {'Backup'}
          <br />
          {'Wallet'}
        </div>
      ),
    },
    {
      title: (
        <div style={{ lineHeight: '18px' }}>
          {'Sync'}
          <br />
          {'SSP Key'}
        </div>
      ),
    },
  ];
  return (
    <>
      <ConfigProvider
        theme={{
          components: {
            Steps: {
              customIconFontSize: 10,
              customIconSize: 10,
              descriptionMaxWidth: 10,
              titleLineHeight: 10,
            },
          },
        }}
      >
        <Steps
          current={props.step}
          labelPlacement="vertical"
          items={items}
          size="small"
          direction="horizontal"
          responsive={false}
          className='creation-steps'
        />
      </ConfigProvider>
    </>
  );
}

export default CreationSteps;

