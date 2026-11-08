/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncementItem, AnnouncementsModel } from '@/views/dashboard';
import { createTestAnnouncement, createTestAnnouncementsModel } from '@/sdk/testing';
import DashboardAnnouncements from '@/components/announcements/DashboardAnnouncements';

const acknowledge = vi.fn();
const dismiss = vi.fn();

const model = (items: readonly AnnouncementItem[], busy = false): AnnouncementsModel =>
    createTestAnnouncementsModel({ items, busy, actions: { acknowledge, dismiss } });

beforeEach(() => {
    acknowledge.mockReset();
    dismiss.mockReset();
});

afterEach(cleanup);

describe('DashboardAnnouncements', () => {
    it('renders nothing when the model has no banners', () => {
        const { container } = render(<DashboardAnnouncements model={model([])} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('renders one banner per item, each labelled without relying on colour', () => {
        render(
            <DashboardAnnouncements
                model={model([
                    createTestAnnouncement({ title: 'First notice' }),
                    createTestAnnouncement({ id: 2, title: 'Second notice', kind: 'warning' }),
                ])}
            />
        );

        expect(screen.getByText('First notice')).toBeVisible();
        expect(screen.getByText('Second notice')).toBeVisible();
        expect(screen.getAllByText('Information')).toHaveLength(1);
        expect(screen.getAllByText('Warning')).toHaveLength(1);
    });

    it('acknowledges through the model actions', async () => {
        render(
            <DashboardAnnouncements
                model={model([createTestAnnouncement({ id: 7, policy: 'until_ack', requireAck: true })])}
            />
        );
        await userEvent.click(screen.getByRole('button', { name: /acknowledge/i }));

        expect(acknowledge).toHaveBeenCalledWith(7);
    });

    it('records a dismissal and hides an every_visit banner from this view', async () => {
        render(
            <DashboardAnnouncements
                model={model([createTestAnnouncement({ id: 3, title: 'Recurring', policy: 'every_visit' })])}
            />
        );
        await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

        expect(dismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
        expect(screen.queryByText('Recurring')).toBeNull();
    });

    it('shows an acknowledged banner without its ack action', () => {
        render(
            <DashboardAnnouncements
                model={model([
                    createTestAnnouncement({
                        id: 8,
                        policy: 'until_ack',
                        requireAck: true,
                        ackedAt: '2026-11-05T10:00:00Z',
                    }),
                ])}
            />
        );

        expect(screen.getByText('Acknowledged')).toBeVisible();
        expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
    });

    it('places its className on the outermost element', () => {
        render(
            <DashboardAnnouncements
                className='probe-root'
                model={model([createTestAnnouncement({ title: 'Notice' })])}
            />
        );

        expect(screen.getByRole('status').parentElement).toHaveClass('probe-root');
    });
});
