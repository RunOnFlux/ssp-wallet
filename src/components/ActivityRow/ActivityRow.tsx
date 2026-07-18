import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import {
  ArrowDownToLine as ArrowDownToLineIcon,
  ArrowUpToLine as ArrowUpToLineIcon,
  CircleCheck as CircleCheckIcon,
  Clock as ClockIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ActivityRow.css';

/**
 * Shared v2 activity feed row — used by BOTH the all-chains Activity page and
 * Home's per-chain Activity sub-tab (including its pending-approval rows), so
 * the two surfaces can never drift apart visually.
 *
 * Anatomy: direction glyph in a tinted circle (send = amber ↑, receive =
 * success ↓) · label + meta line on the left · amount + fiat right-aligned in
 * tabular-nums · confirmed/unconfirmed state chip (or a caller-supplied
 * status node, e.g. the pending-approval countdown). Expanded detail content
 * is caller-provided and rendered inside the shared `.feed-details` inset
 * card (defined in index.css and reused by the Tokens/Nodes tabs too).
 */
export interface ActivityRowProps {
  direction: 'in' | 'out';
  /** Main line, e.g. "Received" / "Sent". */
  label: ReactNode;
  /** Meta line, e.g. chain badge + relative time. */
  sub: ReactNode;
  /** Right-aligned formatted crypto amount (signed). */
  amount: ReactNode;
  /** Right-aligned fiat value under the amount. */
  fiat?: ReactNode;
  /** Standard state chip; use statusNode to render something custom. */
  status?: 'confirmed' | 'unconfirmed';
  /** Overrides the state chip (e.g. pending-approval countdown timer). */
  statusNode?: ReactNode;
  /** Amber pending treatment for rows awaiting SSP Key approval. */
  pending?: boolean;
  expanded?: boolean;
  onActivate: () => void;
  /** Expanded detail content, rendered in the shared inset card. */
  details?: ReactNode;
}

function ActivityRow(props: ActivityRowProps) {
  const { t } = useTranslation(['home']);
  const hasDetails = !!props.details;
  return (
    <div className={`arow-wrap${props.pending ? ' arow-wrap-pending' : ''}`}>
      <button
        type="button"
        className="arow"
        onClick={props.onActivate}
        aria-expanded={hasDetails ? !!props.expanded : undefined}
      >
        <span
          className={`arow-glyph ${
            props.direction === 'in' ? 'arow-glyph-in' : 'arow-glyph-out'
          }`}
          aria-hidden="true"
        >
          {props.direction === 'in' ? (
            <ArrowDownToLineIcon />
          ) : (
            <ArrowUpToLineIcon />
          )}
        </span>
        <span className="arow-main">
          <span className="arow-label">{props.label}</span>
          <span className="arow-sub">{props.sub}</span>
        </span>
        <span className="arow-end">
          <span className="arow-amount privacy-sensitive">{props.amount}</span>
          {props.fiat !== undefined && (
            <span className="arow-fiat privacy-sensitive">{props.fiat}</span>
          )}
        </span>
        {props.statusNode ??
          (props.status && (
            <Tooltip
              title={
                props.status === 'confirmed'
                  ? t('home:transactionsTable.tx_confirmed')
                  : t('home:transactionsTable.tx_unconfirmed')
              }
            >
              <span
                className={`arow-status ${
                  props.status === 'confirmed'
                    ? 'arow-status-confirmed'
                    : 'arow-status-unconfirmed'
                }`}
              >
                {props.status === 'confirmed' ? (
                  <CircleCheckIcon />
                ) : (
                  <ClockIcon />
                )}
              </span>
            </Tooltip>
          ))}
      </button>
      {props.expanded && hasDetails && (
        <div className="feed-details arow-details">{props.details}</div>
      )}
    </div>
  );
}

export default ActivityRow;
