import React, { useState } from 'react';
import { FloatButton, Dropdown, Space, Typography } from 'antd';
import {
  QuestionCircleOutlined,
  BookOutlined,
  CustomerServiceOutlined,
  GlobalOutlined,
  FileTextOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface FloatingHelpProps {
  showGuide?: boolean;
}

export const FloatingHelp: React.FC<FloatingHelpProps> = ({
  showGuide = true,
}) => {
  const { t } = useTranslation(['welcome']);
  const [open, setOpen] = useState(false);

  const openExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const items: MenuProps['items'] = [
    ...(showGuide
      ? [
          {
            key: 'guide',
            label: (
              <Space>
                <BookOutlined style={{ color: '#52c41a' }} />
                <div>
                  <div>{t('welcome:watch_guide')}</div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {t('welcome:help.guide_desc')}
                  </Text>
                </div>
              </Space>
            ),
            onClick: () => openExternalLink('https://sspwallet.io/guide'),
          },
        ]
      : []),
    {
      key: 'website',
      label: (
        <Space>
          <GlobalOutlined style={{ color: '#722ed1' }} />
          <div>
            <div>{t('welcome:help.website')}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t('welcome:help.website_desc')}
            </Text>
          </div>
        </Space>
      ),
      onClick: () => openExternalLink('https://sspwallet.io'),
    },
    {
      key: 'support',
      label: (
        <Space>
          <CustomerServiceOutlined style={{ color: '#fa8c16' }} />
          <div>
            <div>{t('welcome:help.support')}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t('welcome:help.support_desc')}
            </Text>
          </div>
        </Space>
      ),
      onClick: () => openExternalLink('https://sspwallet.io/support'),
    },
    {
      type: 'divider',
    },
    {
      key: 'privacy',
      label: (
        <Space>
          <SafetyOutlined style={{ color: '#13c2c2' }} />
          <div>
            <div>{t('welcome:help.privacy')}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t('welcome:help.privacy_desc')}
            </Text>
          </div>
        </Space>
      ),
      onClick: () => openExternalLink('https://sspwallet.io/privacy-policy'),
    },
    {
      key: 'terms',
      label: (
        <Space>
          <FileTextOutlined style={{ color: '#eb2f96' }} />
          <div>
            <div>{t('welcome:help.terms')}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t('welcome:help.terms_desc')}
            </Text>
          </div>
        </Space>
      ),
      onClick: () => openExternalLink('https://sspwallet.io/terms-of-service'),
    },
  ];

  return (
    <Dropdown
      menu={{ items }}
      placement="bottomLeft"
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      overlayStyle={{ minWidth: '250px' }}
    >
      <FloatButton
        icon={<QuestionCircleOutlined />}
        tooltip={t('welcome:help.tooltip')}
        style={{
          right: 6,
          bottom: 48,
        }}
      />
    </Dropdown>
  );
};

export default FloatingHelp;
