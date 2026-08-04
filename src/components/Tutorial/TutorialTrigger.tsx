import React, { useEffect, useState } from 'react';
import { Button, Modal, Typography, Space, Row, Col } from 'antd';
import {
  Book as BookIcon,
  CirclePlay as CirclePlayIcon,
  Globe as GlobeIcon,
  Headset as HeadsetIcon,
  MessageCircle as MessageCircleIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTutorial } from './TutorialProvider';
import { sspConfig, updateTutorialConfig } from '../../storage/ssp';
import { version } from '../../../package.json';

const { Text } = Typography;

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

  // A real dialog, not a hand-rolled fixed scrim: antd Modal brings
  // role="dialog" + aria-modal, focus move/trap/return, Escape and mask
  // dismissal, a labelled close button, and the shared modal geometry from
  // index.css (viewport-centred, internally scrollable when tall).
  return (
    <Modal
      open={showWelcome}
      title={t('home:tutorial.tutorial_help')}
      onCancel={handleDismissWelcome}
      footer={null}
      centered
      width={500}
      styles={{ body: { textAlign: 'center' } }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          {/* svg.lucide sizes icons at 1em (index.css antd parity), so
              fontSize IS the size control here. Block + auto margins put the
              icon centered ABOVE the text instead of inline beside its
              first line. */}
          <CirclePlayIcon
            style={{
              fontSize: '48px',
              color: '#fbbf24',
              marginBottom: '16px',
              display: 'block',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          />
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
            icon={<CirclePlayIcon />}
          >
            {t('home:tutorial.start_wallet_tour')}
          </Button>

          <Row gutter={[8, 8]} style={{ width: '100%', marginTop: '16px' }}>
            <Col span={12}>
              <Button
                icon={<GlobeIcon />}
                onClick={() => openExternalLink('https://sspwallet.io')}
                className="tutorial-intro-button"
              >
                {t('home:tutorial.visit_website')}
              </Button>
            </Col>
            <Col span={12}>
              <Button
                icon={<BookIcon />}
                onClick={() => openExternalLink('https://sspwallet.io/guide')}
                className="tutorial-intro-button"
              >
                {t('home:tutorial.user_guide')}
              </Button>
            </Col>
            <Col span={12}>
              <Button
                icon={<HeadsetIcon />}
                onClick={() => openExternalLink('https://sspwallet.io/support')}
                className="tutorial-intro-button"
              >
                {t('home:tutorial.support')}
              </Button>
            </Col>
            <Col span={12}>
              <Button
                icon={<MessageCircleIcon />}
                onClick={() => openExternalLink('https://sspwallet.io/contact')}
                className="tutorial-intro-button"
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
              <span style={{ opacity: 0.4 }}>|</span>
              <Button
                type="link"
                size="small"
                onClick={() =>
                  openExternalLink('https://sspwallet.io/terms-of-service')
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

        <div style={{ textAlign: 'left' }}>
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
      </Space>
    </Modal>
  );
};

export default TutorialTrigger;
