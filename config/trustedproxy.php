<?php

declare(strict_types=1);

return [
    /*
     * Set trusted proxy IP addresses.
     *
     * Both IPv4 and IPv6 addresses are supported, along with CIDR notation, listed
     * comma separated in TRUSTED_PROXIES.
     *
     * The "*" and "**" shortcuts are refused here deliberately. They believe a
     * forwarded header arriving from any socket, so the address an account signs in
     * from becomes whatever the client writes, and an IP ban — along with the sign-in
     * history and the rate limits keyed on it — is stepped over by typing a header.
     * A panel behind a load balancer lists that balancer's address or range instead.
     *
     * Empty, which is the default, trusts no forwarded header at all: the connecting
     * socket is taken to be the client.
     */
    'proxies' => array_values(array_filter(
        array_map(trim(...), explode(',', (string) env('TRUSTED_PROXIES', ''))),
        fn (string $proxy): bool => ! in_array($proxy, ['', '*', '**'], true),
    )),
];
