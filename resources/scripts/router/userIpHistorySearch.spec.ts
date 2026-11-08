import { describe, expect, it } from 'vitest';
import { parseIpHistorySearch } from '@/router/userIpHistorySearch';

describe('the IP history filters', () => {
    /**
     * The address has to survive a round trip through the URL, because it is the filter an
     * administrator pastes into the bar when they are following one host across accounts.
     */
    it('keeps the address that was asked for', () => {
        expect(parseIpHistorySearch({ ip: '203.0.113.7' })).toEqual({ ip: '203.0.113.7' });
        expect(parseIpHistorySearch({ ip: ' 2001:db8::1 ' })).toEqual({ ip: '2001:db8::1' });
    });

    it('reads the outcome the server can filter by and drops the ones it cannot', () => {
        expect(parseIpHistorySearch({ outcome: 'banned' })).toEqual({ outcome: 'banned' });
        expect(parseIpHistorySearch({ outcome: 'accepted' })).toEqual({});
    });

    it('keeps only the directions the controller can sort by', () => {
        expect(parseIpHistorySearch({ sort: '-created_at' })).toEqual({ sort: '-created_at' });
        expect(parseIpHistorySearch({ sort: 'user_agent' })).toEqual({});
    });

    it('drops a page the server would not answer with', () => {
        expect(parseIpHistorySearch({ page: 0 })).toEqual({});
        expect(parseIpHistorySearch({ page: '2' })).toEqual({ page: 2 });
    });
});
