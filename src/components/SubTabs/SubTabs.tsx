import { useId, useRef, useState, type ReactNode } from 'react';
import './SubTabs.css';

export interface SubTabItem {
  key: string;
  label: ReactNode;
  children: ReactNode;
}

/**
 * Home's v2 content sub-tab selector (Tokens / Activity / Contacts / Nodes) —
 * replaces the antd Tabs strip with the established pill language of the
 * Activity page's chain filter chips (amber = active), with real tab
 * semantics and arrow-key navigation.
 *
 * Panes stay mounted once visited and are hidden with `hidden` — this
 * mirrors antd Tabs' lazy-mount/keep-mounted behavior the content relies on
 * (e.g. the Transactions poller sets up its refresh interval on mount).
 */
function SubTabs(props: {
  items: SubTabItem[];
  defaultActiveKey?: string;
  'data-tutorial'?: string;
}) {
  const idBase = useId();
  const initial = props.defaultActiveKey ?? props.items[0]?.key ?? '';
  const [active, setActive] = useState(initial);
  const [visited, setVisited] = useState<string[]>([initial]);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activate = (key: string) => {
    setActive(key);
    setVisited((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next =
      props.items[(index + delta + props.items.length) % props.items.length];
    activate(next.key);
    tabRefs.current[next.key]?.focus();
  };

  return (
    <div className="sub-tabs" data-tutorial={props['data-tutorial']}>
      <div className="sub-tabs-bar" role="tablist">
        {props.items.map((item, index) => (
          <button
            key={item.key}
            ref={(el) => {
              tabRefs.current[item.key] = el;
            }}
            type="button"
            role="tab"
            data-tutorial-tab={item.key}
            id={`${idBase}-tab-${item.key}`}
            aria-selected={active === item.key}
            aria-controls={`${idBase}-pane-${item.key}`}
            tabIndex={active === item.key ? 0 : -1}
            className={`sub-tab${active === item.key ? ' sub-tab-active' : ''}`}
            onClick={() => activate(item.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {props.items.map(
        (item) =>
          visited.includes(item.key) && (
            <div
              key={item.key}
              role="tabpanel"
              id={`${idBase}-pane-${item.key}`}
              aria-labelledby={`${idBase}-tab-${item.key}`}
              hidden={active !== item.key}
              className="sub-tabs-pane"
            >
              {item.children}
            </div>
          ),
      )}
    </div>
  );
}

export default SubTabs;
