import type { ViewProps } from '@pterodactyl/sdk/theme';

/** The auth pages centre themselves, so the frame adds nothing. */
export default function AuthLayout({ children }: ViewProps<'layout.auth'>) {
    return <>{children}</>;
}
