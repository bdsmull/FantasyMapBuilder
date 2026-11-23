import React, { useState } from 'react';

const _KEY = 'panelCollapsed.';

/** Whether a section was left collapsed (remembered in this browser). */
function _storedCollapsed(id: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(_KEY + id) === 'true';
  } catch {
    return false;
  }
}

/**
 * A panel section with a header that collapses it (#38); the app remembers which
 * sections were collapsed. `actions` sit at the right of the header (clicking them
 * doesn't collapse the section).
 */
export const PanelSection: React.FC<{
  id: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, actions, children }) => {
  const [collapsed, setCollapsed] = useState(() => _storedCollapsed(id));
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(_KEY + id, String(next)); } catch { /* not stored */ }
  };
  return (
    <section className={`panel-section${collapsed ? ' panel-section--collapsed' : ''}`}>
      <div className="panel-header panel-section-header">
        <button
          type="button"
          className="panel-section-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? `Show ${title.toLowerCase()}` : `Hide ${title.toLowerCase()}`}
          onClick={toggle}
        >
          <span className="panel-section-caret">{collapsed ? '▸' : '▾'}</span> {title}
        </button>
        {actions && <span className="panel-section-actions">{actions}</span>}
      </div>
      {!collapsed && children}
    </section>
  );
};
