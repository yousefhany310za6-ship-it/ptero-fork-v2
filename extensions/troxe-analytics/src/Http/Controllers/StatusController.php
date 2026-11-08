<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use TroxeAnalytics\Support\DataHealth;

/**
 * Whether analytics is running, what it has stored, and what it cannot know.
 *
 * This is the endpoint that makes every other screen honest: a chart is allowed to be empty,
 * but it has to be able to say which of the three reasons it is — switched off, not collected
 * yet, or a figure this panel cannot measure at all.
 */
final class StatusController
{
    public function __construct(private readonly DataHealth $health) {}

    public function __invoke(): JsonResponse
    {
        return new JsonResponse($this->health->report());
    }
}
