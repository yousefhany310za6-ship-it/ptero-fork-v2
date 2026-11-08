<?php

declare(strict_types=1);

namespace Pterodactyl\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Pterodactyl\Services\Announcements\AnnouncementVisibilityPolicy;

/**
 * Allowlist rule for announcement action buttons: site-relative paths and
 * http(s) URLs only. Rejects javascript:, data:, vbscript:, file:,
 * protocol-relative //host, and anything with whitespace or angle brackets.
 */
final class ValidAnnouncementActionUrl implements ValidationRule
{
    public function __construct(private readonly bool $nullable = true) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (($value === null || $value === '') && $this->nullable) {
            return;
        }

        if (!is_string($value) || !AnnouncementVisibilityPolicy::isValidActionUrl($value)) {
            $fail('The :attribute must be a site-relative path or an http(s) URL.');
        }
    }
}
