import axios from 'axios';
import { isString } from '@/lib/objects';

/**
 * What a closed account is told about itself.
 *
 * This is the whole of the `AccountSuspendedException` payload, and every field in it was
 * written to be shown to the person signing in: the reference to quote, the message an
 * administrator addressed to them, how long the closure stands, and how to reach support. The
 * panel's own reasoning — the reason code, the private note, who acted — never reaches this
 * envelope, so the screen built from it can render all of what it holds.
 */
export interface SuspensionNotice {
    readonly caseId: string;
    /** The newest message written for the account, or null when there is none to show. */
    readonly message: string | null;
    readonly permanent: boolean;
    /** When a temporary suspension lifts, as an ISO timestamp; null when it never lifts on its own. */
    readonly expiresAt: string | null;
    readonly support: { readonly email: string | null; readonly discordUrl: string | null };
}

/**
 * The history state a refusal leaves behind, as the screen that follows reads it. Declared here
 * rather than taken from the router: a view compiles against the SDK's published types, where the
 * router's own state contract does not exist, so what a screen was opened with is met as a shape
 * to decode — never as a field the compiler already vouches for.
 */
export interface SuspensionHistoryState {
    readonly suspension?: Partial<SuspensionNotice>;
}

/** The contacts block of a suspension, as the panel encodes it. */
interface SuspensionMetaSupport {
    readonly email?: string | null;
    readonly discord_url?: string | null;
}

/** The parts of a suspension the panel is willing to name in public. */
interface SuspensionMeta {
    readonly support_case_id?: string | null;
    readonly message?: string | null;
    readonly is_permanent?: boolean;
    readonly expires_at?: string | null;
    readonly support?: SuspensionMetaSupport;
}

/** The envelope `ApiErrorResponse` answers a failure with, of which the refusal sends one error. */
interface ErrorEnvelope {
    readonly errors?: readonly { readonly code?: string; readonly meta?: SuspensionMeta }[];
}

/** A value the panel meant to be read as text, where it sends null for "nothing to show". */
const shown = (value: string | null | undefined): string | null => (isString(value) && value !== '' ? value : null);

/**
 * The suspension a failed sign-in reported, or null when the failure was something else — a
 * wrong password, a throttle, a network error. Callers read null as "not a suspension", never
 * as missing data, so an unrelated error can never render a half-built notice.
 */
export function parseSuspensionNotice(cause: unknown): SuspensionNotice | null {
    const envelope = axios.isAxiosError(cause) ? (cause.response?.data as ErrorEnvelope | undefined) : undefined;
    const meta = envelope?.errors?.find((error) => error.code === 'AccountSuspendedException')?.meta;
    const caseId = shown(meta?.support_case_id);

    if (caseId === null) {
        return null;
    }

    return {
        caseId,
        message: shown(meta?.message),
        permanent: meta?.is_permanent === true,
        expiresAt: shown(meta?.expires_at),
        // An empty support block arrives as `[]`, because PHP has no object that is empty.
        support: { email: shown(meta?.support?.email), discordUrl: shown(meta?.support?.discord_url) },
    };
}

/**
 * The notice a screen was opened with, as the sign-in form left it in history state. A state
 * holding no case id is no notice at all: the page that reads this belongs to whoever was just
 * refused, and to nobody who merely typed in its address.
 */
export function readSuspensionNotice(state: SuspensionHistoryState): SuspensionNotice | null {
    const suspension = state.suspension;
    const caseId = shown(suspension?.caseId);

    if (caseId === null) {
        return null;
    }

    return {
        caseId,
        message: shown(suspension?.message),
        permanent: suspension?.permanent === true,
        expiresAt: shown(suspension?.expiresAt),
        support: {
            email: shown(suspension?.support?.email),
            discordUrl: shown(suspension?.support?.discordUrl),
        },
    };
}
