<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Http;

use Illuminate\Http\Response;
use Pterodactyl\Models\UserSuspension;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * Refusal for an account that is closed.
 *
 * The refusal carries the parts of the suspension the account is entitled to see: the
 * reference to quote, the message written for it, and how long it stands. An administrator's
 * reason, their private note, and their identity are deliberately absent — those describe the
 * decision, and the person on the other side of this response is not owed the reasoning
 * behind it, only its consequences for them.
 *
 * It is a 403 rather than a 401 because the credentials were accepted. Saying "sign in again"
 * to an account that has just signed in correctly is the one thing this response must not do.
 */
class AccountSuspendedException extends HttpException
{
    /**
     * The envelope, as the endpoints that can refuse this way document it.
     *
     * @var array{errors: list<array{code: string, status: string, detail: string, meta: array<string, mixed>}>}
     */
    public const array RESPONSE_EXAMPLE = [
        'errors' => [
            [
                'code' => 'AccountSuspendedException',
                'status' => '403',
                'detail' => 'This account is suspended. Quote support case A7K2P9 when contacting support.',
                'meta' => [
                    'support_case_id' => 'A7K2P9',
                    'message' => 'Your account was suspended while reports of abuse were reviewed.',
                    'is_permanent' => false,
                    'expires_at' => '2026-11-20T00:00:00+00:00',
                    'support' => [
                        'email' => 'support@example.com',
                        'discord_url' => 'https://discord.gg/example',
                    ],
                ],
            ],
        ],
    ];

    /**
     * Where the account was closed by a column rather than by a suspension that can be named —
     * the state a request path sees, and the only honest thing it can say about it.
     */
    public const string DEFAULT_MESSAGE = 'This account is suspended and cannot use the panel.';

    /** @param array<string, mixed> $meta */
    public function __construct(
        string $message = self::DEFAULT_MESSAGE,
        private readonly array $meta = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct(Response::HTTP_FORBIDDEN, $message, $previous);
    }

    /**
     * The refusal a suspended account is given at the sign-in form, where the password was
     * right and there is therefore a suspension to describe.
     */
    public static function forSuspension(?UserSuspension $suspension): self
    {
        if ($suspension === null) {
            return new self();
        }

        return new self(
            'This account is suspended. Quote support case '.$suspension->support_case_id.' when contacting support.',
            [
                'support_case_id' => $suspension->support_case_id,
                // The newest version: a corrected message is read as the current one, and the
                // versions before it are the panel's record rather than something to re-show.
                'message' => $suspension->messages()->orderByDesc('id')->value('message'),
                'is_permanent' => $suspension->isPermanent(),
                'expires_at' => $suspension->expires_at?->toIso8601String(),
                'support' => self::supportContacts(),
            ],
        );
    }

    /**
     * What accompanies the refusal: nothing about the account beyond what was written for it.
     *
     * @return array<string, mixed>
     */
    public function errorMeta(): array
    {
        return $this->meta;
    }

    /**
     * The contacts an account holder can actually reach.
     *
     * `unknown@unknown.com` is what the framework answers with on a panel that never named a
     * support address; quoting it back as someone's route to an answer is a dead end dressed
     * up as one, so it is treated as unset.
     *
     * @return array<string, string>
     */
    private static function supportContacts(): array
    {
        $email = (string) config('pterodactyl.support.email');

        return array_filter([
            'email' => $email === 'unknown@unknown.com' ? '' : $email,
            'discord_url' => (string) config('pterodactyl.support.discord_url'),
        ], static fn (string $value): bool => $value !== '');
    }
}
