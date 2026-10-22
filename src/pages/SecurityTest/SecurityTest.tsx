import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Typography, Space } from 'antd';
import {
  ArrowLeft as ArrowLeftIcon,
  Bug as BugIcon,
  ShieldCheck as ShieldCheckIcon,
  ShieldAlert as ShieldAlertIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { isLockdownActive } from '../../lib/lockdownGate';
import {
  runSecuritySelfTest,
  type SecuritySelfTestReport,
} from '../../lib/securitySelfTest';

const { Title, Text, Paragraph } = Typography;

const RESULT_COLORS = {
  pass: '#22c55e',
  fail: '#ef4444',
  warning: '#f59e0b',
  info: 'inherit',
} as const;

const RESULT_LABELS = {
  pass: 'PASS',
  fail: 'FAIL',
  warning: 'WARN',
  info: 'INFO',
} as const;

/**
 * Hidden diagnostics page (five clicks on the version number). It reports
 * what the build really enforces, SES lockdown, using the self-test that
 * lavamoat-lockdown.js exposes (see lib/securitySelfTest.ts).
 */
const SecurityTest: React.FC = () => {
  const navigate = useNavigate();
  const [report, setReport] = useState<SecuritySelfTestReport | null>(null);

  const runTests = useCallback(() => {
    setReport(
      runSecuritySelfTest({
        globals: window,
        lockdownActive: isLockdownActive(),
        isDevBuild: import.meta.env.DEV,
      }),
    );
  }, []);

  useEffect(() => {
    runTests();
  }, [runTests]);

  const StatusIcon = report?.ok ? ShieldCheckIcon : ShieldAlertIcon;

  return (
    <div style={{ paddingBottom: '43px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Button
            icon={<ArrowLeftIcon />}
            onClick={() => navigate('/')}
            type="default"
          >
            Back to Home
          </Button>
          <Title level={2} style={{ marginTop: 16 }}>
            <StatusIcon style={{ color: report?.ok ? '#22c55e' : '#ef4444' }} />{' '}
            Lockdown Security Test
          </Title>
          <Paragraph>
            Release builds run SES lockdown before any other code. It freezes
            the JavaScript built-ins, so a compromised dependency cannot tamper
            with them, and it disables eval and the Function constructor. This
            page runs the lockdown&apos;s own self-test.
          </Paragraph>
          <Button type="primary" icon={<BugIcon />} onClick={runTests}>
            Run again
          </Button>
        </Card>

        <Card title="Results">
          {report ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong style={{ color: report.ok ? '#22c55e' : '#ef4444' }}>
                {report.ok
                  ? `Lockdown active: ${report.passed} checks passed`
                  : report.failed > 0
                    ? `Lockdown NOT verified: ${report.failed} check(s) failed`
                    : 'Lockdown not active (development build)'}
              </Text>
              {report.results.map((result, index) => (
                <Text
                  key={index}
                  style={{
                    fontFamily: 'var(--ssp-mono)',
                    fontSize: '13px',
                    color: RESULT_COLORS[result.type],
                  }}
                >
                  [{RESULT_LABELS[result.type]}] {result.message}
                </Text>
              ))}
            </Space>
          ) : (
            <Text type="secondary">Running...</Text>
          )}
        </Card>

        <Card title="What is checked">
          <Paragraph>
            • The JavaScript built-ins (Object, Function and Array prototypes)
            are frozen.
            <br />
            • Prototype pollution of Object.prototype is blocked.
            <br />
            • eval() and the Function constructor are blocked.
            <br />
            <br />
            The LavaMoat dependency policy is enforced when the extension is
            built, not at runtime, so this page does not test it.
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
};

export default SecurityTest;
