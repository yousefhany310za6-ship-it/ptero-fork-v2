import { http } from '@pterodactyl/sdk';

const admin = '/api/admin/extensions/troxe-analytics';

export type RangeLabel = '15m' | '1h' | '6h' | '24h' | '7d' | '30d' | '90d';
export type Tier = 'raw' | 'hour' | 'day';

/** The window the server actually drew, which is not always the one that was asked for. */
export interface Period {
    label: string;
    from: string;
    to: string;
    tier: Tier;
    bucket: number;
    seconds: number;
    windows: RangeLabel[];
}

export interface Point {
    t: number;
    samples: number;
    cpu: number | null;
    cpu_peak: number | null;
    memory: number | null;
    memory_peak: number | null;
    /** Absent on a fleet series: disk is a property of one server, not of an average over many. */
    disk?: number | null;
    rx: number | null;
    tx: number | null;
    /** Absent on a raw window: uptime is a property of a rollup bucket, not of a sample. */
    up?: number | null;
    restarts?: number | null;
    /** Only the fleet series knows how many servers a bucket covers. */
    servers?: number | null;
}

/** Window figures weighted by each bucket's sample count. Null means nothing was measured. */
export interface Totals {
    points: number;
    samples: number;
    cpu: number | null;
    cpu_peak: number | null;
    memory: number | null;
    memory_peak: number | null;
    disk_peak: number | null;
    up: number | null;
    restarts: number;
    rx: number | null;
    tx: number | null;
}

export interface ServerRow {
    server_id: number;
    name: string;
    short_id: string;
    node_id: number;
    memory_limit: number;
    disk_limit: number;
    cpu_limit: number;
    samples: number;
    cpu: number | null;
    cpu_peak: number | null;
    memory: number | null;
    memory_peak: number | null;
    disk: number | null;
    rx_bytes: number | null;
    tx_bytes: number | null;
    up: number | null;
    restarts: number;
}

export interface NodeRow {
    id: number;
    name: string;
    fqdn: string;
    maintenance: boolean;
    memory_total: number;
    disk_total: number;
    servers: number;
    cpu_allocated: number;
    memory_allocated: number;
    disk_allocated: number;
    cpu: number | null;
    load1: number | null;
    memory_used: number | null;
    disk_used: number | null;
    running: number | null;
    reachable: boolean | null;
    sampled_at: string | null;
}

export interface NodePoint {
    t: number;
    samples: number;
    servers: number;
    running: number;
    cpu: number | null;
    load1: number | null;
    memory_used: number | null;
    memory_total: number | null;
    disk_used: number | null;
    disk_total: number | null;
    memory_allocated: number;
    disk_allocated: number;
    cpu_allocated: number;
    reachable: number | null;
}

export interface UtilisationRow {
    server_id: number;
    name: string;
    cpu: number | null;
    cpu_limit: number;
    memory: number | null;
    memory_limit: number;
    disk: number | null;
    disk_limit: number;
}

export interface Band {
    band: string;
    servers: number;
}

/** What the panel holds right now, from its own records. */
export interface Census {
    users_total: number;
    users_admin: number;
    users_2fa: number;
    servers_total: number;
    servers_suspended: number;
    servers_installing: number;
    nodes_total: number;
    allocations_total: number;
    allocations_used: number;
    memory_allocated: number;
    disk_allocated: number;
    cpu_allocated: number;
}

/** A day the census was taken on. `servers_active` and the movement columns exist nowhere else. */
export interface CensusRow extends Census {
    bucket: string;
    servers_active: number;
    servers_created: number;
    servers_deleted: number;
    users_created: number;
}

export interface AccountRow {
    user_id: number;
    username: string;
    servers: number;
    memory: number;
    disk: number;
    cpu: number;
}

export interface HttpPoint {
    t: number;
    requests: number;
    errors_4xx: number;
    errors_5xx: number;
}

export interface RouteRow {
    route: string;
    requests: number;
    errors: number;
}

export interface ProbeRow {
    address: string;
    requests: number;
    rejected: number;
    sample_path: string;
}

export interface EventTotals {
    event: string;
    occurrences: number;
}

export interface EventSeriesRow {
    t: number;
    event: string;
    occurrences: number;
}

export interface Events {
    totals: EventTotals[];
    series: EventSeriesRow[];
}

export interface TimelineRow {
    id: number;
    event: string;
    description: string | null;
    ip: string | null;
    actor_type: string | null;
    actor_id: number | null;
    timestamp: string;
}

/** An incident as the monitoring extension presents it. Analytics never writes one. */
export interface Incident {
    id: number;
    rule: string;
    metric: string;
    global: boolean;
    server: { name: string; identifier: string } | null;
    node: string | null;
    value: number;
    peak: number;
    started_at: string;
    resolved_at: string | null;
    acknowledged_at: string | null;
}

export interface RuleRow {
    id: number;
    description: string;
    metric: string;
    threshold: number;
    minutes: number;
    enabled: boolean;
}

export interface Counts {
    open: number;
    resolved: number;
    servers: number;
    nodes: number;
}

/** This machine, as far as the panel can see it. Nothing here is a remote node. */
export interface Host {
    load: number[] | null;
    cpus: number | null;
    memory: { used: number; total: number; container: boolean } | null;
    disk: { total: number | null; free: number | null };
    uptime: number | null;
}

export interface Live {
    running: number;
    total: number;
}

/** The four figures every screen puts in its banner, from the same cached report as /status. */
export interface Health {
    collecting: boolean;
    level: string | null;
    reasons: string[];
    last_pass_at: string | null;
    warnings: string[];
    generated_at: string;
}

export interface StoredRow {
    table: string;
    tier: string | null;
    rows: number;
    oldest: string | null;
    newest: string | null;
}

export interface JobRecord {
    at?: string;
    seconds?: number;
    level?: string;
    stopped?: string | null;
    [key: string]: unknown;
}

export interface StatusReport {
    generated_at: string;
    collecting: boolean;
    configuration: {
        enabled: boolean;
        nodes: boolean;
        http: boolean;
        security: boolean;
        retention: Record<string, number>;
        limits: Record<string, number>;
    };
    pressure: {
        level: string | null;
        reasons: string[];
        cores?: number | null;
        load_per_core?: number | null;
        memory_available_mib?: number | null;
        disk_free_mib?: number | null;
        measured_at?: string | null;
        note?: string;
    };
    cursors: Record<string, string | number | null>;
    stored: StoredRow[];
    sources: {
        samples: { present: boolean; rows: number; raw_horizon_seconds: number | null };
        access_log: { path: string; readable: boolean; bytes: number };
        activity_log: number;
        notes: string[];
    };
    jobs: Record<string, JobRecord>;
    missing: string[];
}

export interface Overview {
    range: Period;
    live: Live | null;
    fleet: { points: Point[]; totals: Totals };
    busiest: ServerRow[];
    nodes: NodeRow[];
    census: Census;
    http: { points: HttpPoint[]; requests: number; errors_4xx: number; errors_5xx: number };
    events: Events;
    incidents: Counts;
    health: Health;
}

export interface Servers {
    range: Period;
    servers: ServerRow[];
    nodes: NodeRow[];
    totals: Census;
    health: Health;
}

export interface ServerDetail {
    server: {
        id: number;
        name: string;
        identifier: string;
        uuid: string;
        node: string | null;
        node_id: number;
        account: string | null;
        status: string | null;
        memory_limit: number;
        disk_limit: number;
        cpu_limit: number;
        created_at: string | null;
    };
    range: Period;
    points: Point[];
    totals: Totals;
    incidents: Incident[];
    health: Health;
}

export interface Nodes {
    range: Period;
    nodes: NodeRow[];
    live: Live | null;
    panel_host: Host;
    fleet: Point[];
    health: Health;
}

export interface NodeDetail {
    node: {
        id: number;
        name: string;
        fqdn: string;
        maintenance: boolean;
        memory_total: number;
        disk_total: number;
        server_count: number;
        cpu_allocated: number;
        memory_allocated: number;
        disk_allocated: number;
    };
    range: Period;
    points: NodePoint[];
    servers: ServerRow[];
    incidents: Incident[];
    health: Health;
}

export interface Resources {
    range: Period;
    servers: UtilisationRow[];
    distribution: { cpu: Band[]; memory: Band[]; disk: Band[] };
    totals: Census;
    nodes: NodeRow[];
    host: Host;
    health: Health;
}

export interface Customers {
    range: Period;
    now: Census;
    series: CensusRow[];
    accounts: AccountRow[];
    health: Health;
}

export interface Network {
    range: Period;
    points: Point[];
    totals: Totals;
    talkers: { rx: ServerRow[]; tx: ServerRow[] };
    addresses: { node_id: number; name: string; total: number; used: number }[];
    health: Health;
}

export interface Security {
    range: Period;
    events: Events;
    timeline: TimelineRow[];
    probes: ProbeRow[];
    panel_errors: { requests: number; errors_4xx: number; errors_5xx: number };
    health: Health;
}

export interface Incidents {
    range: Period;
    counts: Counts;
    incidents: Incident[];
    rules: RuleRow[];
    configured_at: string;
    context: { fleet: Totals; requests: number; errors_5xx: number };
    health: Health;
}

export interface Query {
    range?: RangeLabel;
    from?: string;
    to?: string;
    node?: number;
    sort?: string;
    search?: string;
    limit?: number;
}

const get = async <T>(path: string, params?: Query | Record<string, unknown>): Promise<T> =>
    (await http.get<T>(`${admin}${path}`, { params })).data;

export const keys = Object.freeze({
    overview: (query: string) => ['troxe-analytics', 'overview', query] as const,
    servers: (query: string) => ['troxe-analytics', 'servers', query] as const,
    server: (id: number, query: string) => ['troxe-analytics', 'server', id, query] as const,
    nodes: (query: string) => ['troxe-analytics', 'nodes', query] as const,
    node: (id: number, query: string) => ['troxe-analytics', 'node', id, query] as const,
    resources: (query: string) => ['troxe-analytics', 'resources', query] as const,
    customers: (query: string) => ['troxe-analytics', 'customers', query] as const,
    network: (query: string) => ['troxe-analytics', 'network', query] as const,
    security: (query: string) => ['troxe-analytics', 'security', query] as const,
    incidents: (query: string) => ['troxe-analytics', 'incidents', query] as const,
    status: ['troxe-analytics', 'status'] as const,
});

export const getOverview = (query: Query) => get<Overview>('/overview', query);
export const getServers = (query: Query) => get<Servers>('/servers', query);
export const getServer = (id: number, query: Query) => get<ServerDetail>(`/servers/${id}`, query);
export const getNodes = (query: Query) => get<Nodes>('/nodes', query);
export const getNode = (id: number, query: Query) => get<NodeDetail>(`/nodes/${id}`, query);
export const getResources = (query: Query) => get<Resources>('/resources', query);
export const getCustomers = (query: Query) => get<Customers>('/customers', query);
export const getNetwork = (query: Query) => get<Network>('/network', query);
export const getSecurity = (query: Query) => get<Security>('/security', query);
export const getIncidents = (query: Query) => get<Incidents>('/incidents', query);
export const getStatus = () => get<StatusReport>('/status');

/**
 * Where a report is downloaded from. A link rather than a fetch because the response is a file,
 * and the panel's session and two-factor checks apply to a navigation the same way they do to a
 * request the bundle makes itself.
 */
export const reportHref = (kind: string, query: Query): string => {
    const params = new URLSearchParams({ type: kind });

    Object.entries(query).forEach(([key, value]) => value !== undefined && params.set(key, String(value)));

    return `${admin}/reports?${params.toString()}`;
};
