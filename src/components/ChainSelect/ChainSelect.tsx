import { Fragment, useState, useEffect } from 'react';
import { Button, Modal, message, Image, Row, Col } from 'antd';
import { NoticeType } from 'antd/es/message/interface';
import { useAppSelector } from '../../hooks';
import { useTranslation } from 'react-i18next';
import { blockchains } from '@storage/blockchains';
import { cryptos } from '../../types';
import { switchToChain } from '../../lib/chainSwitching';

function ChainSelect(props: {
  open: boolean;
  openAction: (status: boolean) => void;
}) {
  const blockchainKeys = Object.keys(blockchains);
  const { t } = useTranslation(['home', 'common']);
  const [messageApi, contextHolder] = message.useMessage();
  const { open, openAction } = props;
  const { passwordBlob } = useAppSelector((state) => state.passwordBlob);
  const [chainToSwitch, setChainToSwitch] = useState<keyof cryptos | ''>('');

  const displayMessage = (type: NoticeType, content: string) => {
    void messageApi.open({
      type,
      content,
    });
  };

  useEffect(() => {
    console.log('chain switch effect');
    if (!chainToSwitch) return;
    void (async function () {
      try {
        // Use the new chain switching utility
        await switchToChain(chainToSwitch, passwordBlob);
        setChainToSwitch('');
      } catch (error) {
        console.log(error);
        displayMessage('error', t('home:chainSelect.unable_switch_chain'));
        setChainToSwitch('');
      }
    })();
  }, [chainToSwitch]);

  const handleOk = () => {
    openAction(false);
  };

  const switchChain = (chainName: keyof cryptos) => {
    setChainToSwitch(chainName);
    setTimeout(() => {
      openAction(false);
    }, 50);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={t('home:chainSelect.select_chain')}
        open={open}
        onOk={handleOk}
        style={{ textAlign: 'center', top: 60 }}
        onCancel={handleOk}
        footer={[
          <Button key="ok" type="primary" onClick={handleOk}>
            {t('common:close')}
          </Button>,
        ]}
      >
        <Row
          gutter={[16, 24]}
          style={{ paddingTop: '40px', paddingBottom: '40px' }}
          data-tutorial="chain-list"
        >
          {blockchainKeys.map((chain) => (
            <Fragment key={chain}>
              <Col
                className="gutter-row"
                span={12}
                data-tutorial={chain === 'eth' ? 'chain-item-eth' : undefined}
                onClick={() => switchChain(chain as keyof cryptos)}
                style={{ cursor: 'pointer' }}
              >
                <Col span={24}>
                  <Image
                    height={40}
                    preview={false}
                    src={blockchains[chain].logo}
                  />
                </Col>
                <span style={{ fontSize: '16px', color: 'grey' }}>
                  {blockchains[chain].name}
                </span>
              </Col>
            </Fragment>
          ))}
        </Row>
      </Modal>
    </>
  );
}

export default ChainSelect;
