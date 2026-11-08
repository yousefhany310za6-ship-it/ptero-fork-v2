<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * The fleet as a business: how many accounts and servers exist, how that has changed, and who
 * holds the most of it.
 *
 * The counts are taken from the daily census rather than from the live tables alone, because
 * servers and users are hard-deleted. A day nobody took a census on cannot be recovered, which
 * is the one reason this page can look thinner than the others in its first week.
 *
 * Accounts are named by their login and nothing more. An email address, a phone number and a
 * password hash are the panel's business, not a metrics endpoint's.
 */
final class CustomersController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly PanelSource $panels,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $range = $this->window->resolve($request);

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'now' => $this->panels->census(),
            'series' => $this->history->census($range->from),
            'accounts' => $this->panels->owners($this->window->integer($request, 'limit', 50, 200)),
            'health' => $this->health->banner(),
        ]);
    }
}
