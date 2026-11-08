import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface MarkdownProps {
    children: string;
    className?: string;
}

/** Escape HTML-sensitive chars; we never inject raw HTML. */
const esc = (s: string) => s;

/**
 * Renders a small, safe subset of Markdown as React nodes (no HTML injection).
 * Supports: headings, bold/italic, inline+fenced code, links (http/https/mailto/relative),
 * unordered/ordered lists, blockquotes, horizontal rules, and paragraphs/line breaks.
 */
export default function Markdown({ children, className }: MarkdownProps) {
    const text = children ?? '';
    const blocks = parseBlocks(text);

    return (
        <div className={cn('text-sm leading-relaxed text-muted-foreground', className)}>
            {blocks.map((b, i) => (
                <Block key={i} node={b} />
            ))}
        </div>
    );
}

type Inline =
    | { t: 'text'; v: string }
    | { t: 'br' }
    | { t: 'strong'; c: Inline[] }
    | { t: 'em'; c: Inline[] }
    | { t: 'code'; v: string }
    | { t: 'link'; href: string; c: Inline[] };

type Block =
    | { t: 'p'; c: Inline[] }
    | { t: 'h'; level: number; c: Inline[] }
    | { t: 'ul'; items: Inline[][] }
    | { t: 'ol'; items: Inline[][] }
    | { t: 'blockquote'; c: Block[] }
    | { t: 'pre'; v: string }
    | { t: 'hr' };

const safeHref = (href: string): string | null => {
    const h = href.trim();
    if (!h) return null;
    if (h.startsWith('/') && !h.startsWith('//')) return h;
    if (/^https?:\/\//i.test(h)) return h;
    if (/^mailto:/i.test(h)) return h;
    return null;
};

const parseInline = (src: string): Inline[] => {
    const out: Inline[] = [];
    let i = 0;
    const pushText = (v: string) => {
        if (!v) return;
        const last = out[out.length - 1];
        if (last?.t === 'text') last.v += v;
        else out.push({ t: 'text', v });
    };

    while (i < src.length) {
        if (src.startsWith('\n', i)) {
            out.push({ t: 'br' });
            i += 1;
            continue;
        }
        if (src.startsWith('`', i)) {
            const end = src.indexOf('`', i + 1);
            if (end > i + 1) {
                out.push({ t: 'code', v: src.slice(i + 1, end) });
                i = end + 1;
                continue;
            }
        }
        const bold = src.startsWith('**', i) || src.startsWith('__', i);
        const italic = !bold && (src.startsWith('*', i) || src.startsWith('_', i));
        if (bold || italic) {
            const mark = bold ? src.slice(i, i + 2) : src[i];
            const end = src.indexOf(mark, i + mark.length);
            if (end > i + mark.length) {
                const inner = src.slice(i + mark.length, end);
                out.push(bold ? { t: 'strong', c: parseInline(inner) } : { t: 'em', c: parseInline(inner) });
                i = end + mark.length;
                continue;
            }
        }
        if (src[i] === '[') {
            const mid = src.indexOf('](', i + 1);
            if (mid > i + 1) {
                const end = src.indexOf(')', mid + 2);
                if (end > mid + 2) {
                    const label = src.slice(i + 1, mid);
                    const href = safeHref(src.slice(mid + 2, end));
                    if (href) {
                        out.push({ t: 'link', href, c: parseInline(label) });
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        // autolink bare http(s)
        if (src.startsWith('http://', i) || src.startsWith('https://', i)) {
            let end = i;
            while (end < src.length && !/\s|[<>"')\]]/.test(src[end])) end++;
            const href = src.slice(i, end);
            out.push({ t: 'link', href, c: [{ t: 'text', v: href }] });
            i = end;
            continue;
        }
        pushText(src[i]);
        i += 1;
    }
    return out;
};

const parseBlocks = (src: string): Block[] => {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let i = 0;

    const isBlank = (l: string) => /^\s*$/.test(l);

    while (i < lines.length) {
        if (isBlank(lines[i])) {
            i++;
            continue;
        }
        // fenced code
        const fence = lines[i].match(/^```/);
        if (fence) {
            i++;
            const code: string[] = [];
            while (i < lines.length && !/^```/.test(lines[i])) {
                code.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++;
            blocks.push({ t: 'pre', v: code.join('\n') });
            continue;
        }
        // hr
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
            blocks.push({ t: 'hr' });
            i++;
            continue;
        }
        // heading
        const h = lines[i].match(/^(#{1,4})\s+(.*)$/);
        if (h) {
            blocks.push({ t: 'h', level: h[1].length, c: parseInline(h[2]) });
            i++;
            continue;
        }
        // blockquote
        if (/^>\s?/.test(lines[i])) {
            const q: string[] = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                q.push(lines[i].replace(/^>\s?/, ''));
                i++;
            }
            blocks.push({ t: 'blockquote', c: parseBlocks(q.join('\n')) });
            continue;
        }
        // unordered list
        if (/^\s*[-*+]\s+/.test(lines[i])) {
            const items: Inline[][] = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                items.push(parseInline(lines[i].replace(/^\s*[-*+]\s+/, '')));
                i++;
            }
            blocks.push({ t: 'ul', items });
            continue;
        }
        // ordered list
        if (/^\s*\d+[.)]\s+/.test(lines[i])) {
            const items: Inline[][] = [];
            while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
                items.push(parseInline(lines[i].replace(/^\s*\d+[.)]\s+/, '')));
                i++;
            }
            blocks.push({ t: 'ol', items });
            continue;
        }
        // paragraph
        const p: string[] = [];
        while (
            i < lines.length &&
            !isBlank(lines[i]) &&
            !/^```/.test(lines[i]) &&
            !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
            !/^(#{1,4})\s+/.test(lines[i]) &&
            !/^>\s?/.test(lines[i]) &&
            !/^\s*[-*+]\s+/.test(lines[i]) &&
            !/^\s*\d+[.)]\s+/.test(lines[i])
        ) {
            p.push(lines[i]);
            i++;
        }
        if (p.length) blocks.push({ t: 'p', c: parseInline(p.join('\n')) });
    }
    return blocks;
};

const Inlines = ({ nodes }: { nodes: Inline[] }) => (
    <>
        {nodes.map((n, i) => {
            switch (n.t) {
                case 'text':
                    return <Fragment key={i}>{esc(n.v)}</Fragment>;
                case 'br':
                    return <br key={i} />;
                case 'strong':
                    return (
                        <strong key={i} className='font-semibold text-foreground/90'>
                            <Inlines nodes={n.c} />
                        </strong>
                    );
                case 'em':
                    return (
                        <em key={i}>
                            <Inlines nodes={n.c} />
                        </em>
                    );
                case 'code':
                    return (
                        <code
                            key={i}
                            className='rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/90'
                        >
                            {n.v}
                        </code>
                    );
                case 'link': {
                    const ext = /^https?:\/\//i.test(n.href);
                    return (
                        <a
                            key={i}
                            href={n.href}
                            target={ext ? '_blank' : undefined}
                            rel={ext ? 'noopener noreferrer' : undefined}
                            className='font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'
                        >
                            <Inlines nodes={n.c} />
                        </a>
                    );
                }
            }
        })}
    </>
);

const Block = ({ node }: { node: Block }): ReactNode => {
    switch (node.t) {
        case 'p':
            return (
                <p className='my-1.5 first:mt-0 last:mb-0'>
                    <Inlines nodes={node.c} />
                </p>
            );
        case 'h': {
            const cls =
                node.level === 1
                    ? 'mt-3 mb-1 text-base font-bold text-foreground first:mt-0'
                    : node.level === 2
                      ? 'mt-2.5 mb-1 text-sm font-bold text-foreground first:mt-0'
                      : 'mt-2 mb-0.5 text-sm font-semibold text-foreground/90 first:mt-0';
            const Tag = (node.level === 1 ? 'h4' : node.level === 2 ? 'h5' : 'h6') as 'h4' | 'h5' | 'h6';
            return (
                <Tag className={cls}>
                    <Inlines nodes={node.c} />
                </Tag>
            );
        }
        case 'ul':
            return (
                <ul className='my-1.5 ml-5 list-disc space-y-0.5 marker:text-muted-foreground/70 first:mt-0 last:mb-0'>
                    {node.items.map((it, i) => (
                        <li key={i}>
                            <Inlines nodes={it} />
                        </li>
                    ))}
                </ul>
            );
        case 'ol':
            return (
                <ol className='my-1.5 ml-5 list-decimal space-y-0.5 marker:text-muted-foreground/70 first:mt-0 last:mb-0'>
                    {node.items.map((it, i) => (
                        <li key={i}>
                            <Inlines nodes={it} />
                        </li>
                    ))}
                </ol>
            );
        case 'blockquote':
            return (
                <blockquote className='my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground/90 first:mt-0 last:mb-0'>
                    {node.c.map((b, i) => (
                        <Block key={i} node={b} />
                    ))}
                </blockquote>
            );
        case 'pre':
            return (
                <pre className='my-2 overflow-x-auto rounded-xl border border-border/60 bg-background/60 p-3 font-mono text-xs text-foreground/90 first:mt-0 last:mb-0'>
                    <code>{node.v}</code>
                </pre>
            );
        case 'hr':
            return <hr className='my-3 border-border/60' />;
    }
};
