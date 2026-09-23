/** Shared page hierarchy. Actions and context stay with the title they belong to. */
const PageHeader = ({ eyebrow, title, description, actions, children, compact = false, className = '', titleId }) => (
    <header className={`page-header ${compact ? 'page-header--compact' : ''} ${className}`}>
        <div className="min-w-0">
            {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
            <h1 id={titleId} className={`page-title ${compact ? 'page-title--compact' : ''}`}>{title}</h1>
            {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
        {children && <div className="page-header-context">{children}</div>}
    </header>
);

export default PageHeader;
