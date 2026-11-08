/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnnouncementBanner, {
    kindMeta,
    type AnnouncementBannerProps,
} from '@/components/announcements/AnnouncementBanner';

const base: AnnouncementBannerProps = {
    kind: 'info',
    title: 'Scheduled maintenance',
    body: 'We will restart the panel tonight.',
    policy: 'once',
};

const renderBanner = (over: Partial<AnnouncementBannerProps> = {}) =>
    render(<AnnouncementBanner {...base} {...over} />);

afterEach(cleanup);

describe('AnnouncementBanner', () => {
    it('renders the kind label, title and body as visible text', () => {
        renderBanner({ kind: 'warning' });

        expect(screen.getByText('Warning')).toBeVisible();
        expect(screen.getByText('Scheduled maintenance')).toBeVisible();
        expect(screen.getByText('We will restart the panel tonight.')).toBeVisible();
    });

    it('paints the whole banner in the kind colour, not only its badge', () => {
        const surfaces = {
            info: 'bg-primary/10',
            success: 'bg-success/10',
            warning: 'bg-warning/10',
            critical: 'bg-destructive/10',
        } satisfies Record<AnnouncementBannerProps['kind'], string>;

        for (const [kind, surfaceClass] of Object.entries(surfaces)) {
            const { unmount } = renderBanner({ kind: kind as AnnouncementBannerProps['kind'] });

            expect(screen.getByRole(kind === 'critical' ? 'alert' : 'status').className).toContain(surfaceClass);
            // Colour never carries the meaning on its own: the written label stays.
            expect(screen.getByText(kindMeta[kind as AnnouncementBannerProps['kind']].label)).toBeVisible();
            unmount();
        }
    });

    it('never interprets the body as HTML — markup stays literal text', () => {
        const malicious = '<img src=x onerror=alert(1)> <b>bold</b>';
        const { container } = renderBanner({ body: malicious });

        expect(screen.getByText(malicious)).toBeVisible();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('b')).toBeNull();
    });

    it('marks a critical banner as a live alert and everything else as status', () => {
        const { unmount } = renderBanner({ kind: 'critical' });

        expect(screen.getByRole('alert')).toBeDefined();
        unmount();

        renderBanner({ kind: 'info' });
        expect(screen.getByRole('status')).toBeDefined();
    });

    it('gives the action link a safe target and rel, and points at the given URL', () => {
        renderBanner({ actionLabel: 'Status page', actionUrl: 'https://status.example.test' });

        const link = screen.getByRole('link', { name: /status page/i });

        expect(link).toHaveAttribute('href', 'https://status.example.test');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
        expect(link.getAttribute('rel')).toContain('noreferrer');
    });

    it('shows an acknowledge button for until_ack but never a dismiss button', () => {
        renderBanner({ policy: 'until_ack', requireAck: true, onAck: vi.fn() });

        expect(screen.getByText('Acknowledgement required')).toBeVisible();
        expect(screen.getByRole('button', { name: /acknowledge/i })).toBeVisible();
        expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
    });

    it('drops the ack-required badge once the announcement is acknowledged', () => {
        renderBanner({ policy: 'until_ack', requireAck: true, ackedAt: '2026-11-05T00:00:00+00:00' });

        expect(screen.getByText('Acknowledged')).toBeVisible();
        expect(screen.queryByText('Acknowledgement required')).toBeNull();
        expect(screen.queryByRole('button', { name: /acknowledge/i })).toBeNull();
    });

    it('offers a dismiss button for a once policy and calls onDismiss', async () => {
        const onDismiss = vi.fn();

        renderBanner({ policy: 'once', onDismiss });
        await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        // A once banner is hidden by the server, not locally, so it stays for this render.
        expect(screen.getByRole('status')).toBeDefined();
    });

    it('hides itself right away when an every_visit banner is dismissed', async () => {
        const onDismiss = vi.fn();

        renderBanner({ policy: 'every_visit', onDismiss });
        await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('renders the preview without any interactive controls', () => {
        renderBanner({
            policy: 'until_ack',
            requireAck: true,
            actionLabel: 'Go',
            actionUrl: 'https://x.test',
            preview: true,
        });

        expect(screen.queryByRole('button', { name: /acknowledge/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
        expect(screen.getByRole('link', { name: /go/i })).toHaveAttribute('tabindex', '-1');
    });

    it('shows a formatted maintenance window for critical and warning kinds', () => {
        renderBanner({
            kind: 'critical',
            eventStart: '2026-11-05T22:00:00+00:00',
            eventEnd: '2026-11-06T00:00:00+00:00',
        });

        expect(screen.getByText(/^Maintenance window:/)).toBeVisible();
    });
});
