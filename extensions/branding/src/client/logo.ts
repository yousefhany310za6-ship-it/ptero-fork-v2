import { logo, logoCollapsed, logoHeight, logoMascot, logoMode } from './config.ts';

/**
 * Puts the logo in front of the company name (`#logo a`) in the top bar or in the ThemesPlus sidebar.
 *
 * It is one <img> element, created once and reused, so it never reloads or re-animates. The link's
 * layout comes from classes on <html> that are set once, so nothing changes when you move between
 * pages. A MutationObserver puts the same image back whenever the panel re-renders the bar; observer
 * callbacks run before the browser paints, so the name never shows without it.
 */
/** The panel's own picture on the sign-in pages (the Pterodactyl mascot) becomes the logo. */
const MASCOT = "img[src$='/assets/svgs/pterodactyl.svg']";

function swapMascot(src: string): void {
    for (const img of document.querySelectorAll<HTMLImageElement>(MASCOT)) {
        img.src = src;
        img.alt = document.title.split(' | ')[0] || 'Logo';
        img.classList.add('br-mascot');
        img.addEventListener('error', () => img.remove(), { once: true });
    }
    // Panel 2.0 draws the mascot as an inline <svg> on the sign-in pages: the large picture beside the form becomes an <img>.
    if (!window.location.pathname.startsWith('/auth')) return;
    for (const svg of document.querySelectorAll<SVGSVGElement>('svg.mx-auto')) {
        const width = svg.getBoundingClientRect().width;
        if (svg.closest('button, a, input') || width < 96) continue;
        const img = document.createElement('img');
        // Same box as the picture it replaces, so a wide logo cannot push the form aside.
        img.style.width = `${Math.round(width)}px`;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.flex = 'none';
        img.src = src;
        img.alt = document.title.split(' | ')[0] || 'Logo';
        img.className = `${svg.getAttribute('class') ?? ''} br-mascot`;
        img.addEventListener('error', () => img.replaceWith(svg), { once: true });
        svg.replaceWith(img);
    }
}

export function mountLogo(): void {
    const src = logo();
    if (!src) return;
    if (logoMascot()) {
        swapMascot(src);
        new MutationObserver(() => swapMascot(src)).observe(document.body, { childList: true, subtree: true });
    }
    const mode = logoMode();
    if (mode === 'off') return;

    const root = document.documentElement;
    root.classList.add('br-has-logo');
    root.classList.toggle('br-replace', mode === 'replace');
    root.style.setProperty('--br-logo-h', `${logoHeight()}px`);
    // For themes that draw their own brand (the ThemesPlus sidebar): the logos and how to show them.
    root.dataset.brLogo = src;
    root.dataset.brMode = mode;
    const small = logoCollapsed();
    if (small) root.dataset.brLogoCollapsed = small;

    const img = document.createElement('img');
    img.className = 'br-logo-img';
    img.alt = '';
    img.decoding = 'async';
    img.src = src;

    let failed = false;
    img.addEventListener('error', () => {
        // Broken image: fall back to the plain company name.
        failed = true;
        img.remove();
        root.classList.remove('br-has-logo', 'br-replace');
        delete root.dataset.brLogo;
    });

    let frame = 0;
    const ensure = () => {
        frame = 0;
        if (failed) return;
        const link = document.querySelector<HTMLAnchorElement>('#logo a');
        if (!link || link.firstElementChild === img) return;
        link.insertBefore(img, link.firstChild);
        if (mode === 'replace') img.alt = link.textContent?.trim() || 'Home';
    };

    ensure();
    // Only the top bar's subtree matters; the panel re-renders it, rarely.
    new MutationObserver(() => {
        if (document.querySelector('#logo a')?.firstElementChild === img) return;
        ensure();
    }).observe(document.body, { childList: true, subtree: true });
    void frame;
}
