import { mbToBytes } from '@pterodactyl/sdk';
import type { ServerListItem, ServerListModel } from '@pterodactyl/sdk/theme';

/** Bytes, or percent of one core for CPU; a `limit` of 0 means nothing is capped. */
export interface Pool {
    readonly used: number;
    readonly limit: number;
}

/** A server the account owner should look at, and why. */
export type Notice =
    | { readonly kind: 'suspended'; readonly item: ServerListItem }
    | { readonly kind: 'installing'; readonly item: ServerListItem }
    | { readonly kind: 'maintenance'; readonly item: ServerListItem };

/** Everything the Overview says about the servers on the loaded page. */
export interface Summary {
    /** Servers on every page, from the list's pagination. */
    readonly servers: number;
    readonly running: number;
    readonly offline: number;
    /** Cards with no reading: suspended, installing, or a node that cannot be reached. */
    readonly silent: number;
    /** Memory and disk the plan allows and the nodes report using. */
    readonly memory: { readonly used: number; readonly allowed: number };
    readonly disk: { readonly used: number; readonly allowed: number };
    /** Percent of one core, summed over the servers that are running. */
    readonly cpu: number;
    /** Cores the plan allows, summed; 0 means every server is uncapped. */
    readonly cpuAllowed: number;
    readonly notices: readonly Notice[];
    /** False until the first page has loaded, so the Overview draws a skeleton instead of zeros. */
    readonly ready: boolean;
    /** The page is one of several, so what is summed here is not everything the account holds. */
    readonly partial: boolean;
}

/** Percent used against what is allowed; an uncapped pool reads empty rather than dividing by zero. */
export function meterPercent(used: number, allowed: number): number {
    if (allowed <= 0) return 0;

    return Math.min(100, Math.max(0, (used / allowed) * 100));
}

/** A CPU limit is a percent of one core, which reads as cores to a person with more than one server. */
export function cores(limit: number): string {
    if (limit <= 0) return 'no cap';
    if (limit % 100 === 0) return `${limit / 100} ${limit / 100 === 1 ? 'core' : 'cores'}`;

    return `${limit}%`;
}

export function summarize(model: ServerListModel): Summary {
    const notices: Notice[] = [];
    let memoryUsed = 0;
    let memoryAllowed = 0;
    let diskUsed = 0;
    let diskAllowed = 0;
    let cpu = 0;
    let cpuAllowed = 0;
    let silent = 0;

    for (const item of model.servers) {
        const { attributes } = item.server;

        // Both limits are megabytes here, as they are on the server cards.
        memoryAllowed += mbToBytes(attributes.limits.memory);
        diskAllowed += mbToBytes(attributes.limits.disk);
        cpuAllowed += attributes.limits.cpu;

        if (attributes.is_suspended) {
            notices.push({ kind: 'suspended', item });
        } else if (attributes.is_installing || attributes.is_transferring) {
            notices.push({ kind: 'installing', item });
        } else if (attributes.is_node_under_maintenance) {
            notices.push({ kind: 'maintenance', item });
        }

        if (item.state.kind !== 'ready') {
            silent += 1;
            continue;
        }

        memoryUsed += item.state.memory.value;
        diskUsed += item.state.disk.value;

        // A stopped container holds disk but no memory, and a starting one is not yet on its cap.
        if (item.state.power === 'running') {
            cpu += item.state.cpu.value;
        }
    }

    const { pagination } = model;

    return {
        servers: model.totals.servers,
        running: model.totals.runningOnPage,
        offline: model.totals.offlineOnPage,
        silent,
        memory: { used: memoryUsed, allowed: memoryAllowed },
        disk: { used: diskUsed, allowed: diskAllowed },
        cpu,
        cpuAllowed,
        notices,
        ready: !model.loading && pagination !== null,
        partial: (pagination?.totalPages ?? 1) > 1,
    };
}
