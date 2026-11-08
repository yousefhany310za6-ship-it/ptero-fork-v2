import { glyphs, fallbacks } from './icons.generated';
import { iconKey } from './resolve';

interface Props {
    name: string;
    kind: string;
    className?: string;
}

/**
 * A Material icon, in its own colours, for one file-manager entry. The glyph table is only reachable
 * through this component, so it stays in the file views' lazy chunk instead of the theme's entry.
 */
export default function Glyph({ name, kind, className }: Props) {
    const glyph = glyphs[iconKey({ name, kind })] ?? glyphs[fallbacks.file];

    return (
        <svg
            viewBox={glyph.viewBox}
            className={className}
            aria-hidden='true'
            focusable='false'
            // Build-time output from an MIT-licensed icon set, never request data.
            dangerouslySetInnerHTML={{ __html: glyph.body }}
        />
    );
}
