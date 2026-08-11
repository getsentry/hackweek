import MarkdownRenderer, {type Components} from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const components: Components = {
  a({node, href, ...props}) {
    void node;
    const external = href?.startsWith('https://') || href?.startsWith('http://');
    return (
      <a
        {...props}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
      />
    );
  },
};

const compactElements = ['a', 'strong', 'em', 'del', 'code', 'br'] as const;

export function Markdown({
  children,
  compact = false,
}: {
  children: string;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? 'markdown markdown--compact' : 'markdown'}
      title={compact ? children : undefined}
    >
      <MarkdownRenderer
        allowedElements={compact ? compactElements : undefined}
        components={components}
        remarkPlugins={[remarkGfm, remarkBreaks]}
        unwrapDisallowed={compact}
      >
        {children}
      </MarkdownRenderer>
    </div>
  );
}
