import { useMemo } from 'react';
import { Alert, Collapse, Space, Tag, Typography, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import type {
  ProposalSimulation,
  SimWarning,
  SimWarningCode,
  SimWarningSeverity,
} from '../../types/simulation';
import { sortWarningsBySeverity } from '../../types/simulation';

const { Text } = Typography;

interface Props {
  simulation: ProposalSimulation | null;
  /**
   * Extra warnings computed locally on the device (e.g. the synthetic
   * SIMULATION_DECODE_MISMATCH from comparing server sim vs the device decode).
   * Merged with the server warnings and sorted by severity.
   */
  extraWarnings?: SimWarning[];
}

const severityToAlertType: Record<
  SimWarningSeverity,
  'error' | 'warning' | 'info'
> = {
  critical: 'error',
  high: 'warning',
  medium: 'warning',
  info: 'info',
};

const severityToTagColor: Record<SimWarningSeverity, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  info: 'blue',
};

/**
 * Map a warning code to its (typed) i18n key. Every known SimWarningCode has a
 * key under `risk.codes.*`, so the template-literal type resolves to a valid
 * translation-key union. For forward-compat with codes the server may add
 * before the client knows them, the caller still falls back to the
 * server-provided English message when i18next returns the key unchanged.
 */
function warningTitleKey(
  code: SimWarningCode,
): `home:enterpriseVaultSignTx.risk.codes.${SimWarningCode}` {
  return `home:enterpriseVaultSignTx.risk.codes.${code}`;
}

/**
 * Advisory risk strip for the enterprise vault sign screen.
 *
 * SAFETY / DESIGN INVARIANTS:
 *  - DISPLAY-ONLY. This component renders warnings; it does NOT and CANNOT block
 *    the approve/authenticate button. The user can always still sign.
 *  - The device's own trustless decode (VaultDecodedTx) remains the PRIMARY,
 *    authoritative display. This strip is clearly labelled "Risk checks
 *    (advisory)".
 *  - critical/high warnings render as prominent banners the user scrolls past
 *    before the sign control; medium/info collapse into a subtle list.
 *  - On SIMULATION_DECODE_MISMATCH the caller also visually downranks the
 *    server preview; here we surface the critical banner.
 */
function VaultRiskStrip({ simulation, extraWarnings }: Props) {
  const { t } = useTranslation(['home', 'common']);

  const allWarnings = useMemo<SimWarning[]>(() => {
    const server = simulation?.warnings ?? [];
    const merged = [...(extraWarnings ?? []), ...server];
    return sortWarningsBySeverity(merged);
  }, [simulation, extraWarnings]);

  // Nothing to show at all (no simulation object and no local warnings).
  if (!simulation && allWarnings.length === 0) {
    return null;
  }

  const status = simulation?.status;

  const prominent = allWarnings.filter(
    (w) => w.severity === 'critical' || w.severity === 'high',
  );
  const subtle = allWarnings.filter(
    (w) => w.severity === 'medium' || w.severity === 'info',
  );

  const renderWarningMessage = (w: SimWarning): string => {
    const key = warningTitleKey(w.code);
    const translated = t(key);
    // i18next returns the key itself when no translation exists.
    if (translated && translated !== key) return translated;
    return w.message || w.code;
  };

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      {/* Advisory label — makes clear the device decode is authoritative. */}
      <div style={{ textAlign: 'left' }}>
        <Text type="secondary" strong style={{ fontSize: '12px' }}>
          {t('home:enterpriseVaultSignTx.risk.heading')}
        </Text>
      </div>

      {/* Pending: server is still simulating. Advisory, non-blocking. */}
      {status === 'pending' && (
        <Alert
          type="info"
          icon={<Spin size="small" />}
          showIcon
          message={t('home:enterpriseVaultSignTx.risk.pending')}
          style={{ textAlign: 'left' }}
        />
      )}

      {/* Unavailable: could not simulate. Show graceful degradation note. */}
      {status === 'unavailable' && (
        <Alert
          type="info"
          showIcon
          message={t('home:enterpriseVaultSignTx.risk.unavailable')}
          style={{ textAlign: 'left' }}
        />
      )}

      {/* Reverted: high-severity note. Does not block signing. */}
      {status === 'reverted' && (
        <Alert
          type="warning"
          showIcon
          message={t('home:enterpriseVaultSignTx.risk.reverted')}
          description={simulation?.revertReason || undefined}
          style={{ textAlign: 'left' }}
        />
      )}

      {/* Prominent critical/high warnings — always visible. */}
      {prominent.map((w, i) => (
        <Alert
          key={`prominent-${i}`}
          type={severityToAlertType[w.severity]}
          showIcon
          message={renderWarningMessage(w)}
          description={w.detail || undefined}
          style={{ textAlign: 'left' }}
        />
      ))}

      {/* Subtle medium/info warnings — collapsible. */}
      {subtle.length > 0 && (
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'risk-details',
              label: (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {t('home:enterpriseVaultSignTx.risk.more', {
                    count: subtle.length,
                  })}
                </Text>
              ),
              children: (
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: '100%' }}
                >
                  {subtle.map((w, i) => (
                    <div key={`subtle-${i}`} style={{ textAlign: 'left' }}>
                      <Tag color={severityToTagColor[w.severity]}>
                        {t(
                          `home:enterpriseVaultSignTx.risk.severity.${w.severity}`,
                        )}
                      </Tag>
                      <Text style={{ fontSize: '13px' }}>
                        {renderWarningMessage(w)}
                      </Text>
                      {w.detail && (
                        <div>
                          <Text
                            type="secondary"
                            style={{
                              fontSize: '11px',
                              fontFamily: 'var(--ssp-mono)',
                              wordBreak: 'break-all',
                            }}
                          >
                            {w.detail}
                          </Text>
                        </div>
                      )}
                    </div>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      )}

      {/* Footnote reinforcing that this is advisory, decode is authoritative. */}
      <Text type="secondary" style={{ fontSize: '11px', textAlign: 'left' }}>
        {t('home:enterpriseVaultSignTx.risk.advisory_footnote')}
      </Text>
    </Space>
  );
}

export default VaultRiskStrip;
