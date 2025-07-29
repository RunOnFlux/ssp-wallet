import React, { useEffect, useState } from 'react';
import { Button, Card, Typography, Space, Row, Col } from 'antd';
import {
  PlayCircleOutlined,
  CloseOutlined,
  GlobalOutlined,
  BookOutlined,
  CustomerServiceOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTutorial } from './TutorialProvider';
import { sspConfig, updateTutorialConfig } from '../../storage/ssp';
import { version } from '../../../package.json';

const { Title, Text } = Typography;

interface TutorialTriggerProps {
  autoStart?: boolean;
  showWelcomePrompt?: boolean;
  isNewWallet?: boolean;
  walletSynced?: boolean;
  forceShowWelcome?: boolean;
  onWelcomeDismiss?: () => void;
}

export const TutorialTrigger: React.FC<TutorialTriggerProps> = ({
  autoStart = true,
  showWelcomePrompt = true,
  isNewWallet = false,
  walletSynced = false,
  forceShowWelcome = false,
  onWelcomeDismiss,
}) => {
  const { t } = useTranslation(['home']);
  const { startTutorial, isActive } = useTutorial();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const checkTutorialTrigger = () => {
      try {
        const config = sspConfig();
        const tutorialConfig = config.tutorial;

        // Only show tutorial for new wallets (create/restore) after sync
        if (!isNewWallet || !walletSynced) return;

        if (
          autoStart &&
          (!tutorialConfig ||
            (!tutorialConfig.completed && !tutorialConfig.cancelled)) &&
          showWelcomePrompt
        ) {
          // Wait a bit after sync completes to show tutorial
          setTimeout(() => {
            setShowWelcome(true);
          }, 1000);
        }
      } catch (error) {
        console.log('Error checking tutorial status:', error);
      }
    };

    if (!isActive) {
      checkTutorialTrigger();
    }
  }, [autoStart, showWelcomePrompt, isActive, isNewWallet, walletSynced]);

  // Handle external trigger for welcome screen
  useEffect(() => {
    if (forceShowWelcome) {
      setShowWelcome(true);
    }
  }, [forceShowWelcome]);

  const handleStartTutorial = (tutorialType: string = 'onboarding') => {
    setShowWelcome(false);
    onWelcomeDismiss?.();
    startTutorial(tutorialType);
  };

  const handleDismissWelcome = () => {
    setShowWelcome(false);
    onWelcomeDismiss?.();
  };

  const handleSkipTutorial = async () => {
    try {
      // Permanently mark tutorial as cancelled so it won't show again
      await updateTutorialConfig({
        completed: false,
        cancelled: true,
        currentStep: 0,
        tutorialType: 'onboarding',
      });
      setShowWelcome(false);
      onWelcomeDismiss?.();
    } catch (error) {
      console.log('Error skipping tutorial:', error);
      // Fallback to just dismiss
      handleDismissWelcome();
    }
  };

  const openExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (isActive) {
    return null;
  }

  return (
    <>
      {showWelcome && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <Card
            style={{
              maxWidth: 500,
              width: '100%',
              textAlign: 'center',
              position: 'relative',
            }}
            extra={
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={handleDismissWelcome}
                size="small"
              />
            }
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <PlayCircleOutlined
                  style={{
                    fontSize: '48px',
                    color: '#1890ff',
                    marginBottom: '16px',
                  }}
                />
                <Title level={3} style={{ margin: '0 0 8px 0' }}>
                  {t('home:tutorial.tutorial_help')}
                </Title>
                <Text type="secondary">
                  {t('home:tutorial.wallet_synchronized_desc')}
                </Text>
              </div>

              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  size="large"
                  onClick={() => handleStartTutorial('onboarding')}
                  style={{ width: '100%' }}
                  icon={<PlayCircleOutlined />}
                >
                  {t('home:tutorial.start_wallet_tour')}
                </Button>

                <Row
                  gutter={[8, 8]}
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  <Col span={12}>
                    <Button
                      icon={<GlobalOutlined />}
                      onClick={() => openExternalLink('https://sspwallet.io')}
                      style={{ width: '100%' }}
                    >
                      {t('home:tutorial.visit_website')}
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button
                      icon={<BookOutlined />}
                      onClick={() =>
                        openExternalLink('https://sspwallet.io/guide')
                      }
                      style={{ width: '100%' }}
                    >
                      {t('home:tutorial.user_guide')}
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button
                      icon={<CustomerServiceOutlined />}
                      onClick={() =>
                        openExternalLink('https://sspwallet.io/support')
                      }
                      style={{ width: '100%' }}
                    >
                      {t('home:tutorial.support')}
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button
                      icon={<MessageOutlined />}
                      onClick={() =>
                        openExternalLink('https://sspwallet.io/contact')
                      }
                      style={{ width: '100%' }}
                    >
                      {t('home:tutorial.contact')}
                    </Button>
                  </Col>
                </Row>

                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <Space
                    direction="horizontal"
                    size="small"
                    style={{ fontSize: '12px' }}
                  >
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        openExternalLink('https://sspwallet.io/privacy-policy')
                      }
                      style={{ padding: '0', height: 'auto', fontSize: '12px' }}
                    >
                      {t('home:tutorial.privacy_policy')}
                    </Button>
                    <span style={{ color: '#ccc' }}>|</span>
                    <Button
                      type="link"
                      size="small"
                      onClick={() =>
                        openExternalLink(
                          'https://sspwallet.io/terms-of-service',
                        )
                      }
                      style={{ padding: '0', height: 'auto', fontSize: '12px' }}
                    >
                      {t('home:tutorial.terms_of_service')}
                    </Button>
                  </Space>
                </div>

                <Space
                  direction="horizontal"
                  size="large"
                  style={{ marginTop: '16px' }}
                >
                  <Button type="text" onClick={handleDismissWelcome}>
                    {t('home:tutorial.maybe_later')}
                  </Button>
                  <Button type="text" onClick={handleSkipTutorial}>
                    {t('home:tutorial.skip_tutorial')}
                  </Button>
                </Space>
              </Space>
            </Space>

            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '12px',
              }}
            >
              <Text
                type="secondary"
                style={{
                  fontSize: '10px',
                  opacity: 0.6,
                }}
              >
                v{version}
              </Text>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default TutorialTrigger;
