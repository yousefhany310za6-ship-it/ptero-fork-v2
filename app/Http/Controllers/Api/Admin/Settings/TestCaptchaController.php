<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Settings;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Knuckles\Scribe\Attributes\UrlParam;
use Pterodactyl\Captcha\Providers\ProviderRegistry;
use Pterodactyl\Captcha\Value\VerificationResult;
use Pterodactyl\Extensions\Scribe\Attributes\ResponseField;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Settings\TestCaptchaProviderRequest;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Asks a provider about a token that cannot be real, which is the only honest way to find out whether
 * its keys work without solving a challenge or sending anything a browser would recognise. A provider
 * that rejects the token but not the secret has its configuration confirmed; anything else says so.
 */
#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Settings', 'View and update global panel settings.')]
class TestCaptchaController extends AdminApiController
{
    /** A value no provider can have issued, so its rejection says nothing about a real user. */
    private const string PROBE_TOKEN = 'panel-configuration-probe';

    /** Codes that mean the keys themselves are wrong, whichever provider says them. */
    private const array KEY_CODES = ['invalid-input-secret', 'missing-input-secret', 'sitekey-secret-mismatch'];

    /** Every answer this endpoint gives, as status() decides between them. */
    private const array STATUSES = ['test_keys', 'keys_rejected', 'connected', 'unreachable', 'misconfigured'];

    private const array TEST_EXAMPLE = [
        'provider' => 'turnstile',
        'status' => 'connected',
        'error_codes' => ['invalid-input-response'],
        'details' => ['the provider rejected a token nobody could have solved, but accepted the secret behind it'],
    ];

    #[UrlParam('provider', 'string', 'The provider to ask.', example: 'turnstile')]
    #[Endpoint('Test a captcha provider', 'Checks a provider can be reached and its keys are accepted by asking it about a token that cannot be real. Neither key value is ever returned.')]
    #[ResponseField('status', 'string', 'What the answer means: whether the provider was reached, and whether it accepted the keys.', enum: self::STATUSES)]
    #[ScribeResponse(self::TEST_EXAMPLE, description: 'The provider answered.')]
    #[ScribeResponse(status: 404, description: 'No provider with that name is configured.')]
    public function __invoke(TestCaptchaProviderRequest $request, ProviderRegistry $providers, string $provider): JsonResponse
    {
        $instance = $providers->get($provider);

        if ($instance === null) {
            throw new HttpException(Response::HTTP_NOT_FOUND, 'No captcha provider is configured with that name.');
        }

        if (($errors = $instance->configurationErrors()) !== []) {
            return new JsonResponse([
                'provider' => $instance->name(),
                'status' => 'misconfigured',
                'error_codes' => [],
                'details' => $errors,
            ]);
        }

        $result = $instance->verify(self::PROBE_TOKEN, null);

        return new JsonResponse([
            'provider' => $instance->name(),
            'status' => $this->status($result),
            'error_codes' => $result->errorCodes,
            'details' => $result->reasons,
        ]);
    }

    private function status(VerificationResult $result): string
    {
        // A provider that says yes to a token nobody solved is answering with test keys, which is
        // worth saying out loud rather than reporting as a configuration that works.
        if ($result->passed) {
            return 'test_keys';
        }

        if (array_intersect(self::KEY_CODES, $result->errorCodes) !== []) {
            return 'keys_rejected';
        }

        // Codes about the token mean the secret behind them was read and accepted.
        if ($result->errorCodes !== []) {
            return 'connected';
        }

        return 'unreachable';
    }
}
