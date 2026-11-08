<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Security;

use Illuminate\Http\Request;
use Pterodactyl\Support\Network\IpAddress;
use Pterodactyl\Support\Network\IpAddressNormalizer;

/**
 * The only place a request is turned into the address the panel acts on.
 *
 * `$request->ip()` is the whole policy: Symfony reads the socket peer and only believes a
 * forwarded header when the proxy that sent it is listed in config/trustedproxy.php. That
 * list is empty unless an operator fills it in from the environment, and it refuses the
 * '*' and '**' shortcuts, so nothing an unauthenticated client can write ever decides
 * which ban, history row, or rate-limit bucket applies to it. Adding a reverse proxy
 * later means listing its address there — this code needs no change, and no header is
 * parsed here.
 */
final class ClientIpResolver
{
    /**
     * The client address in normalised form, or null when the request carries none. A
     * caller that is about to refuse or record something treats that as unattributable
     * rather than as an address that happens to be banned nowhere.
     */
    public static function resolve(Request $request): ?IpAddress
    {
        return IpAddressNormalizer::parse($request->ip());
    }
}
