import React, { Component, ReactNode } from 'react';
import { Result, Button, Collapse, Typography, message, Card, theme } from 'antd';
import { ExceptionOutlined, RedoOutlined, CopyOutlined, BugOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';

const { Text } = Typography;

// Shared function to copy error details
const copyErrorDetails = (error: Error | null, errorInfo: React.ErrorInfo | null) => {
  const errorDetails = [
    'SSP Wallet Error Report',
    '======================',
    `Time: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`,
    `URL: ${window.location.href}`,
    '',
    `Error: ${error?.name || 'Unknown'}`,
    `Message: ${error?.message || 'No message'}`,
    '',
    'Stack Trace:',
    error?.stack || 'No stack trace available',
    '',
    'Component Stack:',
    errorInfo?.componentStack || 'No component stack available'
  ].join('\n');

  navigator.clipboard.writeText(errorDetails)
    .then(() => message.success('Error details copied to clipboard'))
    .catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = errorDetails;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      message.success('Error details copied to clipboard');
    });
};

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundaryClass extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidMount() {
    // Add global error handler as backup
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleGlobalError = (event: ErrorEvent) => {
    console.error('Global error caught:', event);
    // Don't trigger error boundary UI for global errors
    // Just log them for debugging purposes
  };

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error('Unhandled rejection caught:', event);
    // Don't trigger error boundary UI for unhandled rejections
    // Just log them for debugging purposes
  };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React error caught:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.hash = '#/';
  };

  handleCopyError = () => {
    copyErrorDetails(this.state.error, this.state.errorInfo);
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    
    return <ErrorBoundaryUI 
      error={this.state.error} 
      errorInfo={this.state.errorInfo}
      onRestart={this.handleRestart}
      onCopyError={this.handleCopyError}
    />;
  }
}

interface UIProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onRestart: () => void;
  onCopyError: () => void;
}

function ErrorBoundaryUI({ error, errorInfo, onRestart, onCopyError }: UIProps) {
  const { t } = useTranslation(['errorBoundary']);
  const { token } = theme.useToken();

  const containerStyle = {
    padding: '16px',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-start' as const,
    maxWidth: '420px',
    margin: '0 auto',
    overflow: 'auto' as const,
    paddingTop: '20px'
  };

  const cardStyle = {
    width: '100%',
    marginTop: '16px',
    backgroundColor: token.colorSuccessBg,
    border: `1px solid ${token.colorSuccessBorder}`,
    textAlign: 'left' as const
  };

  const preStyle = {
    fontSize: '10px',
    backgroundColor: token.colorFillAlter,
    color: token.colorText,
    padding: '8px',
    borderRadius: '4px',
    overflow: 'auto' as const,
    maxHeight: '120px',
    marginTop: '4px',
    wordBreak: 'break-all' as const,
    whiteSpace: 'pre-wrap' as const,
    border: `1px solid ${token.colorBorder}`
  };

  return (
    <div style={containerStyle}>
      <Result
        icon={<ExceptionOutlined />}
        title={t('title')}
        subTitle={t('subtitle')}
        style={{
          paddingTop: '24px',
          paddingBottom: '16px'
        }}
        extra={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <Button type="primary" icon={<RedoOutlined />} onClick={onRestart} block>
              {t('restart_button')}
            </Button>
            <Button icon={<CopyOutlined />} onClick={onCopyError} block>
              {t('copy_button')}
            </Button>
          </div>
        }
      />

      <Card 
        title={
          <span>
            <InfoCircleOutlined style={{ marginRight: '8px', color: token.colorSuccess }} />
            {t('help_title')}
          </span>
        } 
        size="small" 
        style={cardStyle}
      >
        <p style={{ fontSize: '13px', marginBottom: '8px' }}>
          <strong>{t('report_via')}</strong>
        </p>
        <ul style={{ fontSize: '12px', paddingLeft: '16px', marginBottom: '12px' }}>
          <li>{t('support')}</li>
          <li>{t('discord')}</li>
          <li>{t('github')}</li>
        </ul>
        <p style={{ fontSize: '13px', marginBottom: '8px' }}>
          <strong>{t('include_title')}</strong>
        </p>
        <ul style={{ fontSize: '12px', paddingLeft: '16px' }}>
          <li>{t('include_steps')}</li>
          <li>{t('include_context')}</li>
          <li>{t('include_details')}</li>
        </ul>
      </Card>

      {(error || errorInfo) && (
        <Collapse 
          style={{ marginTop: '16px', width: '100%', marginBottom: '24px' }} 
          size="small"
          items={[
            {
              key: 'error-details',
              label: (
                <span>
                  <BugOutlined style={{ marginRight: '6px' }} />
                  {t('technical_details')}
                </span>
              ),
              children: (
                <div style={{ maxHeight: '250px', overflow: 'auto' }}>
                  {error && (
                    <div style={{ marginBottom: '12px' }}>
                      <Text strong>{t('error_type')} </Text>
                      <Text code>{error.name}</Text>
                      <br />
                      <Text strong>{t('error_message')} </Text>
                      <Text style={{ wordBreak: 'break-word' }}>{error.message}</Text>
                      
                      {error.stack && (
                        <div style={{ marginTop: '8px' }}>
                          <Text strong>{t('stack_trace')}</Text>
                          <pre style={preStyle}>{error.stack}</pre>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {errorInfo?.componentStack && (
                    <div>
                      <Text strong>{t('component_stack')}</Text>
                      <pre style={preStyle}>{errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              )
            }
          ]}
        />
      )}
    </div>
  );
}

export default function ErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundaryClass>{children}</ErrorBoundaryClass>;
}

// Router Error component that uses the same UI as ErrorBoundary
export function RouterErrorBoundary() {
  const routerError = useRouteError();
  
  // Convert router error to Error object if needed
  const error = routerError instanceof Error 
    ? routerError 
    : new Error(String(routerError || 'Unknown router error'));

  return (
    <ErrorBoundaryUI 
      error={error} 
      errorInfo={{ componentStack: 'Router error' }}
      onRestart={() => window.location.hash = '#/'}
      onCopyError={() => copyErrorDetails(error, { componentStack: 'Router error' })}
    />
  );
}