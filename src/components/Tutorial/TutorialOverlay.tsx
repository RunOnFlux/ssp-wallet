import React, { useEffect, useState } from 'react';
import { Button, Typography, Card, Space, Flex, Modal } from 'antd';
import {
  CloseOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import './TutorialOverlay.css';

const { Text } = Typography;

export interface TutorialStep {
  id: string;
  target: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  action?: 'click' | 'none';
  skipable?: boolean;
  hidePrevious?: boolean;
  syncHint?: string;
  closeModal?: boolean;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  isActive: boolean;
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onClose: () => void;
  onPause: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  steps,
  isActive,
  currentStep,
  onNext,
  onPrevious,
  onComplete,
  onClose,
  onPause,
}) => {
  const { t } = useTranslation(['home']);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [cardPosition, setCardPosition] = useState({ top: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isUserPositioned, setIsUserPositioned] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [highlightPosition, setHighlightPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });
  const [elementNotFoundCount, setElementNotFoundCount] = useState(0);

  const currentStepData = steps[currentStep];

  useEffect(() => {
    if (!isActive || !currentStepData || isClosing) {
      setTargetElement(null);
      setElementNotFoundCount(0); // Reset counter when tutorial becomes inactive
      // Remove any tutorial step classes
      document.body.classList.remove('tutorial-step-select-ethereum');
      return;
    }

    // Add CSS class for select-ethereum step to disable other chains
    if (currentStepData.id === 'select-ethereum') {
      document.body.classList.add('tutorial-step-select-ethereum');
    } else {
      document.body.classList.remove('tutorial-step-select-ethereum');
    }

    // Reset previous target element styles
    if (targetElement) {
      targetElement.style.pointerEvents = '';
      targetElement.style.position = '';
      targetElement.style.zIndex = '';
    }

    // Clear target element when step changes
    setTargetElement(null);

    let retryCount = 0;
    const maxRetries = 30; // Try for 1.5 seconds with faster intervals
    const maxElementNotFoundBeforePause = 2; // Pause after 2 consecutive failures across steps (more sensitive)

    const findTargetElement = () => {
      // Don't search for elements if tutorial is closing
      if (isClosing) return;

      // If no target specified, don't highlight anything (used for sync states)
      if (!currentStepData.target) {
        setTargetElement(null);
        setHighlightPosition({ top: 0, left: 0, width: 0, height: 0 });
        setElementNotFoundCount(0); // Reset counter for no-target steps
        return;
      }

      const element = document.querySelector(
        currentStepData.target,
      ) as HTMLElement;
      if (element) {
        if (!isClosing) {
          setTargetElement(element);
          updatePositions(element);
          retryCount = 0; // Reset retry count on success
          setElementNotFoundCount(0); // Reset not found counter on success
        }

        if (currentStepData.action === 'click') {
          element.style.pointerEvents = 'auto';
          element.style.position = 'relative';
          element.style.zIndex = '10001';
        }
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          // If element not found, try again after a shorter delay for faster detection
          setTimeout(findTargetElement, 50);
        } else {
          // Check if this step requires previous user interaction and is impossible to start on
          const isStepRequiringPreviousAction =
            // Steps that require clicking elements that only exist after user action
            (currentStepData.action === 'click' &&
              (currentStepData.target.includes('chain-item-') ||
                currentStepData.target.includes('modal') ||
                currentStepData.target.includes('dropdown-item') ||
                currentStepData.id === 'select-ethereum')) ||
            // Steps where Next button is hidden (meaning they need user interaction first)
            (currentStepData.action === 'click' && !targetElement);

          if (isStepRequiringPreviousAction) {
            console.warn(
              `Tutorial step ${currentStepData.id} requires previous user interaction - auto-pausing`,
            );
            onPause();
            return;
          }

          // Check for logout/navigation indicators before counting as failure
          const logoutIndicators = [
            // Key elements that should exist when logged in
            '[data-tutorial="wallet-overview"]',
            '[data-tutorial="balance-overview"]',
            '[data-tutorial="wallet-selector"]',
            '.ant-tabs', // Navigation tabs
            'nav', // Any navigation
          ];

          const hasLoggedInElements = logoutIndicators.some(
            (selector) => document.querySelector(selector) !== null,
          );

          if (!hasLoggedInElements) {
            console.warn(
              'Tutorial auto-pausing - user appears to have logged out or navigated away',
            );
            onPause();
            return;
          }

          // After all retries failed, increment not found counter
          const newNotFoundCount = elementNotFoundCount + 1;
          setElementNotFoundCount(newNotFoundCount);

          console.warn(
            `Tutorial target not found after ${maxRetries} retries: ${currentStepData.target}`,
          );

          // Debug: Check what chain items are actually available
          if (currentStepData.target.includes('chain-item-')) {
            const allTutorialElements =
              document.querySelectorAll('[data-tutorial]');
            console.log(
              'All tutorial elements found:',
              Array.from(allTutorialElements).map((el) =>
                el.getAttribute('data-tutorial'),
              ),
            );
          }

          // If we've failed to find elements too many times, auto-pause tutorial
          if (newNotFoundCount >= maxElementNotFoundBeforePause) {
            console.warn(
              'Tutorial auto-pausing due to missing elements (user likely logged out or navigated away)',
            );
            onPause();
            return;
          }

          // Try fallback to balance overview if available
          const fallbackElement = document.querySelector(
            '[data-tutorial="balance-overview"]',
          ) as HTMLElement;
          if (fallbackElement) {
            setTargetElement(fallbackElement);
            updatePositions(fallbackElement);
          } else {
            // No fallback available, this contributes to our failure count
            setTargetElement(null);
            setHighlightPosition({ top: 0, left: 0, width: 0, height: 0 });
          }
        }
      }
    };

    // Early check for step viability - pause immediately if step is impossible
    const isStepImpossible =
      currentStepData.action === 'click' &&
      (currentStepData.target.includes('chain-item-') ||
        currentStepData.id === 'select-ethereum');

    if (isStepImpossible) {
      // Do a quick check if the required element exists
      const quickCheck = document.querySelector(currentStepData.target);
      if (!quickCheck) {
        console.warn(
          `Tutorial step ${currentStepData.id} is impossible without previous interaction - auto-pausing`,
        );
        onPause();
        return;
      }
    }

    // Immediate search for faster highlighting, then delay fallback
    findTargetElement();
    // Also set a delayed search to catch elements that appear after DOM updates
    setTimeout(findTargetElement, 25);

    // For modal/dropdown elements, add more aggressive polling
    if (
      currentStepData.target.includes('chain-item-') ||
      currentStepData.target.includes('chain-selector')
    ) {
      console.log(
        `Starting aggressive polling for tutorial target: ${currentStepData.target}`,
      );
      const modalPolling = setInterval(() => {
        const element = document.querySelector(currentStepData.target);
        if (element) {
          console.log(
            `Found tutorial target via polling: ${currentStepData.target}`,
          );
          clearInterval(modalPolling);
          findTargetElement();
        } else {
          console.log(
            `Polling attempt for ${currentStepData.target} - not found yet`,
          );
        }
      }, 25);

      // Stop polling after longer time for chain items (they're in modals)
      const pollingDuration = currentStepData.target.includes('chain-item-')
        ? 5000
        : 3000;
      setTimeout(() => {
        clearInterval(modalPolling);
        const allChainItems = document.querySelectorAll(
          '[data-tutorial*="chain-item"]',
        );
        console.log(`Polling stopped. Found chain items:`, allChainItems);
        const allEthElements = document.querySelectorAll(
          '[data-tutorial="chain-item-eth"]',
        );
        console.log(`Specific eth elements:`, allEthElements);
      }, pollingDuration);
    }

    const observer = new MutationObserver(() => {
      // Immediate check for faster detection of new elements
      findTargetElement();
      // Also set a small delay to catch any follow-up changes
      setTimeout(findTargetElement, 25);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also listen for scroll events to update positions
    const handleScroll = () => {
      const currentElement = document.querySelector(
        currentStepData.target,
      ) as HTMLElement;
      if (currentElement) {
        updatePositions(currentElement);
      }
    };

    // Listen for navigation/logout events
    const handleNavigationChange = () => {
      // Check if we're still on the correct page for tutorial
      const logoutIndicators = [
        '[data-tutorial="wallet-overview"]',
        '[data-tutorial="balance-overview"]',
        '[data-tutorial="wallet-selector"]',
      ];

      const hasWalletElements = logoutIndicators.some(
        (selector) => document.querySelector(selector) !== null,
      );

      if (!hasWalletElements) {
        console.warn('Tutorial auto-pausing due to navigation/logout detected');
        onPause();
      }
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('beforeunload', handleNavigationChange);
    window.addEventListener('popstate', handleNavigationChange);

    // Also check periodically for navigation changes
    const navigationCheckInterval = setInterval(handleNavigationChange, 2000);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('beforeunload', handleNavigationChange);
      window.removeEventListener('popstate', handleNavigationChange);
      clearInterval(navigationCheckInterval);
      if (targetElement) {
        targetElement.style.pointerEvents = '';
        targetElement.style.position = '';
        targetElement.style.zIndex = '';
      }
    };
  }, [isActive, currentStep, currentStepData]);

  const updatePositions = (element: HTMLElement) => {
    // Don't update positions if tutorial is closing
    if (isClosing) return;

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft =
      window.pageXOffset || document.documentElement.scrollLeft;

    // Set highlight position (absolute positioning for highlight)
    const newHighlightPosition = {
      top: rect.top + scrollTop,
      left: rect.left + scrollLeft,
      width: rect.width,
      height: rect.height,
    };
    setHighlightPosition(newHighlightPosition);

    // Calculate card position (responsive for small screens)
    const cardElement = document.querySelector('.tutorial-card') as HTMLElement;
    const cardWidth = cardElement
      ? cardElement.offsetWidth
      : window.innerWidth < 500
        ? 320
        : 400;
    const cardHeight = cardElement ? cardElement.offsetHeight : 150;
    const padding = window.innerWidth < 500 ? 10 : 20;
    const screenPadding = window.innerWidth < 500 ? 5 : 20;

    // Smart positioning - prefer bottom-right of target element
    let cardTop = rect.bottom + padding;
    let cardLeft = rect.left;

    // Check if card would go off-screen and adjust
    if (cardLeft + cardWidth > window.innerWidth - screenPadding) {
      cardLeft = window.innerWidth - cardWidth - screenPadding;
    }
    if (cardTop + cardHeight > window.innerHeight - screenPadding) {
      cardTop = rect.top - cardHeight - padding;
    }
    if (cardTop < screenPadding) {
      cardTop = screenPadding;
    }
    if (cardLeft < screenPadding) {
      cardLeft = screenPadding;
    }

    // Only auto-position if user hasn't manually positioned the card
    if (!isUserPositioned) {
      setCardPosition({ top: cardTop, left: cardLeft });
    }
  };

  // Drag functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      (e.target as Element).closest('.ant-card-head')
    ) {
      setIsDragging(true);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      e.preventDefault();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (
      e.target === e.currentTarget ||
      (e.target as Element).closest('.ant-card-head')
    ) {
      setIsDragging(true);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const touch = e.touches[0];
      setDragOffset({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      updateCardPosition(e.clientX, e.clientY);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging) {
      const touch = e.touches[0];
      updateCardPosition(touch.clientX, touch.clientY);
    }
  };

  const updateCardPosition = (clientX: number, clientY: number) => {
    const newPosition = {
      top: clientY - dragOffset.y,
      left: clientX - dragOffset.x,
    };

    // Get actual card dimensions from the DOM element
    const cardElement = document.querySelector('.tutorial-card') as HTMLElement;
    const cardWidth = cardElement ? cardElement.offsetWidth : 350;
    const cardHeight = cardElement ? cardElement.offsetHeight : 150;

    // More lenient boundaries for small screens
    const padding = window.innerWidth < 500 ? 5 : 10;
    const maxLeft = window.innerWidth - cardWidth - padding;
    const maxTop = window.innerHeight - cardHeight - padding;

    newPosition.top = Math.max(padding, Math.min(newPosition.top, maxTop));
    newPosition.left = Math.max(padding, Math.min(newPosition.left, maxLeft));

    setCardPosition(newPosition);
    setIsUserPositioned(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Add global event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
      document.addEventListener('touchend', handleTouchEnd);
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, dragOffset]);

  // Reset user positioning when step changes
  useEffect(() => {
    setIsUserPositioned(false);
    setIsClosing(false);
    // Reset element not found counter when step changes (new step, fresh start)
    setElementNotFoundCount(0);
  }, [currentStep]);

  const handleClose = () => {
    setIsClosing(true);
    // Immediately hide the tutorial to prevent any movement
    setTimeout(() => {
      onClose();
    }, 0);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      onNext();
    } else {
      onComplete();
    }
  };

  const handleTargetClick = () => {
    if (currentStepData.action === 'click') {
      // Special handling for steps that open modals - need longer delay for modal to render
      let delay = 100; // default delay

      if (currentStepData.target.includes('chain-selector')) {
        // "Switch Chain" button opens modal - need time for modal to render before next step
        delay = 300;
      } else if (currentStepData.target.includes('wallet-selector')) {
        // Wallet selector opens dropdown - shorter delay
        delay = 50;
      } else if (
        currentStepData.target.includes('selector') ||
        currentStepData.target.includes('dropdown')
      ) {
        delay = 50;
      }

      setTimeout(handleNext, delay);
    }
  };

  useEffect(() => {
    if (targetElement && currentStepData.action === 'click') {
      targetElement.addEventListener('click', handleTargetClick);
      return () =>
        targetElement.removeEventListener('click', handleTargetClick);
    }
  }, [targetElement, currentStepData]);

  if (!isActive || !currentStepData) return null;

  // Show completion modal for the final step
  if (currentStepData.id === 'tutorial-complete') {
    return (
      <Modal
        open={true}
        onCancel={onComplete}
        footer={null}
        centered
        width={400}
        style={{ textAlign: 'center' }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <CheckCircleOutlined
              style={{
                fontSize: '48px',
                color: '#52c41a',
                marginBottom: '16px',
              }}
            />
            <Typography.Title level={3} style={{ margin: '0 0 8px 0' }}>
              {currentStepData.title}
            </Typography.Title>
            <Typography.Text type="secondary">
              {currentStepData.content}
            </Typography.Text>
          </div>

          <Button
            type="primary"
            size="large"
            onClick={onComplete}
            style={{ width: '100%' }}
            icon={<CheckCircleOutlined />}
          >
            {t('home:tutorial.complete')}
          </Button>
        </Space>
      </Modal>
    );
  }

  return (
    <div className="tutorial-overlay">
      {/* Highlight element */}
      {targetElement && highlightPosition.width > 0 && (
        <div
          className="tutorial-highlight"
          style={{
            position: 'fixed',
            top:
              highlightPosition.top -
              (window.pageYOffset || document.documentElement.scrollTop) -
              2,
            left:
              highlightPosition.left -
              (window.pageXOffset || document.documentElement.scrollLeft) -
              2,
            width: highlightPosition.width + 4,
            height: highlightPosition.height + 4,
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        />
      )}

      {/* Tutorial Card */}
      <Card
        className={`tutorial-card ${isDragging ? 'dragging' : ''} ${isClosing ? 'closing' : ''}`}
        style={{
          top: cardPosition.top,
          left: cardPosition.left,
        }}
        size="small"
        title={
          <Flex
            justify="space-between"
            align="center"
            style={{ width: '100%' }}
          >
            <Flex align="center" gap={6} style={{ flex: 1, minWidth: 0 }}>
              <span className="tutorial-drag-handle" />
              <Text
                strong
                style={{
                  fontSize: '14px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {currentStepData.title}
              </Text>
            </Flex>
            <Flex
              align="center"
              gap={8}
              style={{ flexShrink: 0, marginLeft: 16 }}
            >
              <Text className="tutorial-step-indicator">
                {currentStep + 1}/{steps.length}
              </Text>
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={handleClose}
                size="small"
              />
            </Flex>
          </Flex>
        }
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div className="tutorial-content">
            <Text>{currentStepData.content}</Text>
            {currentStepData.action === 'click' && currentStepData.target && (
              <Text className="tutorial-click-hint">
                {t('home:tutorial.click_highlighted')}
              </Text>
            )}
            {currentStepData.syncHint && (
              <Text className="tutorial-click-hint">
                {currentStepData.syncHint}
              </Text>
            )}
          </div>

          <div className="tutorial-actions">
            <Flex justify="space-between" style={{ width: '100%' }}>
              <div>
                {!currentStepData.hidePrevious && (
                  <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={onPrevious}
                    disabled={currentStep === 0}
                    size="small"
                  >
                    {t('home:tutorial.previous')}
                  </Button>
                )}
              </div>
              <div>
                {currentStepData.action !== 'click' && (
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={handleNext}
                    size="small"
                  >
                    {currentStep === steps.length - 1
                      ? t('home:tutorial.complete')
                      : t('home:tutorial.next')}
                  </Button>
                )}
              </div>
            </Flex>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default TutorialOverlay;
