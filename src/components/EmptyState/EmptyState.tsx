import type { ReactNode } from 'react';
import './EmptyState.css';

/**
 * Branded v2 empty state — replaces raw antd <Empty> (the gray inbox) across
 * the Home tabs and the Activity page: a lucide icon in an amber-tinted
 * circle, one line of copy, and an optional action.
 */
function EmptyState(props: {
  /** Lucide icon element (sized by CSS). Decorative. */
  icon: ReactNode;
  description: ReactNode;
  /** Optional action button/link rendered under the description. */
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {props.icon}
      </span>
      <div className="empty-state-desc">{props.description}</div>
      {props.action && <div className="empty-state-action">{props.action}</div>}
    </div>
  );
}

export default EmptyState;
