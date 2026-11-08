<?php

declare(strict_types=1);

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Console\Kernel as ConsoleKernelContract;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Console\Kernel;
use Pterodactyl\Console\Scheduler;
use Pterodactyl\Exceptions\ApiErrorResponse;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\AccountSuspendedException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Http\Middleware\Activity\TrackAPIKey;
use Pterodactyl\Http\Middleware\Api\Admin\AuthenticateAdmin;
use Pterodactyl\Http\Middleware\Api\Application\AuthenticateApplicationUser;
use Pterodactyl\Http\Middleware\Api\AuthenticateIPAccess;
use Pterodactyl\Http\Middleware\Api\Client\RequireClientApiKey;
use Pterodactyl\Http\Middleware\Api\Client\SubstituteClientBindings;
use Pterodactyl\Http\Middleware\Api\Daemon\DaemonAuthenticate;
use Pterodactyl\Http\Middleware\Api\IsValidJson;
use Pterodactyl\Http\Middleware\EnsureAccountIsActive;
use Pterodactyl\Http\Middleware\EnsureStatefulRequests;
use Pterodactyl\Http\Middleware\LanguageMiddleware;
use Pterodactyl\Http\Middleware\MaintenanceMiddleware;
use Pterodactyl\Http\Middleware\RedirectIfAuthenticated;
use Pterodactyl\Http\Middleware\RejectBannedIpAddresses;
use Pterodactyl\Http\Middleware\RememberThemeFlags;
use Pterodactyl\Http\Middleware\RequireTwoFactorAuthentication;
use Pterodactyl\Http\Middleware\SetSecurityHeaders;
use Pterodactyl\Http\Middleware\VerifyCaptcha;
use Pterodactyl\Http\Middleware\VerifyReCaptcha;
use Pterodactyl\Services\Themes\ThemeResolver;
use Symfony\Component\HttpKernel\Exception\HttpException;

$app = Application::configure(basePath: $_ENV['APP_BASE_PATH'] ?? dirname(__DIR__))
    ->withRouting(using: function (): void {
        Route::middleware('web')->group(function (): void {
            // A session that outlived its account is closed here: the check runs once the
            // session has resolved a user, and before anything else is asked about them.
            Route::middleware(['auth.session', EnsureAccountIsActive::class, RequireTwoFactorAuthentication::class])
                ->group(base_path('routes/base.php'));

            Route::middleware('guest')->prefix('/auth')->group(base_path('routes/auth.php'));
        });

        Route::middleware(['api'])->group(function (): void {
            Route::middleware(['application-api', 'throttle:api.application'])
                ->prefix('/api/application')
                ->scopeBindings()
                ->group(base_path('routes/api-application.php'));

            Route::middleware(['client-api', 'throttle:api.client'])
                ->prefix('/api/client')
                ->scopeBindings()
                ->group(base_path('routes/api-client.php'));

            Route::middleware(['admin-api', 'throttle:api.admin'])
                ->prefix('/api/admin')
                ->scopeBindings()
                ->group(base_path('routes/api-admin.php'));
        });

        Route::middleware('daemon')
            ->prefix('/api/remote')
            ->scopeBindings()
            ->group(base_path('routes/api-remote.php'));
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(SetSecurityHeaders::class);

        $middleware->trimStrings(except: [
            'password',
            'password_confirmation',
            fn (Request $request): bool => $request->is('api/client/servers/*/files', 'api/client/servers/*/files/*'),
        ]);

        $middleware->preventRequestForgery(except: ['remote/*', 'daemon/*']);

        $middleware->redirectGuestsTo('/auth/login');

        $middleware->priority([SubstituteClientBindings::class]);

        // First in both groups, so a banned address is refused before the session starts,
        // before the csrf token and the captcha are consulted, and before the login throttle
        // is charged. Not in the global stack: that runs ahead of TrustProxies, and the
        // address would then be read before the request knows which proxies it may believe.
        $middleware->web(prepend: [RejectBannedIpAddresses::class]);
        $middleware->api(prepend: [RejectBannedIpAddresses::class]);

        $middleware->web(append: [LanguageMiddleware::class, RememberThemeFlags::class, VerifyCaptcha::class]);

        // Written by the SPA, so it is never encrypted.
        $middleware->encryptCookies(except: [ThemeResolver::SCHEME_COOKIE]);

        $middleware->group('api', [
            EnsureStatefulRequests::class,
            'auth:sanctum',
            IsValidJson::class,
            TrackAPIKey::class,
            // Every way into these routes is checked here — a browser session, an account API
            // key, an application key — because `auth:sanctum` above resolves all three into the
            // same user, and this runs once that has happened and before the second-factor gate,
            // so a closed account is refused for being closed rather than for wanting to enable
            // something it is not allowed to use.
            EnsureAccountIsActive::class,
            RequireTwoFactorAuthentication::class,
            AuthenticateIPAccess::class,
            // A rule an administrator writes for an api path is applied here, without a route
            // file having to ask for it. It answers after authentication, so an unauthenticated
            // flood never reaches a provider with anyone else's tokens.
            VerifyCaptcha::class,
        ]);

        $middleware->group('application-api', [SubstituteBindings::class, AuthenticateApplicationUser::class]);
        $middleware->group('client-api', [SubstituteClientBindings::class, RequireClientApiKey::class]);
        $middleware->group('admin-api', [SubstituteBindings::class, AuthenticateAdmin::class]);
        $middleware->group('daemon', [SubstituteBindings::class, DaemonAuthenticate::class]);

        $middleware->alias([
            'guest' => RedirectIfAuthenticated::class,
            'recaptcha' => VerifyReCaptcha::class,
            'captcha' => VerifyCaptcha::class,
            'node.maintenance' => MaintenanceMiddleware::class,
        ]);
    })
    ->withSchedule(new Scheduler)
    ->withExceptions(function (Exceptions $exceptions): void {
        if (config('app.exceptions.report_all', false)) {
            $exceptions->stopIgnoring([
                AuthenticationException::class,
                AuthorizationException::class,
                HttpException::class,
                ModelNotFoundException::class,
                TokenMismatchException::class,
                ValidationException::class,
            ]);
        } else {
            // A failed Wings call is an HTTP exception that still logs its cause.
            $exceptions->stopIgnoring(HttpException::class)
                ->dontReportWhen(fn (Throwable $e): bool => $e instanceof HttpException && ! $e instanceof DaemonConnectionException);
        }

        $exceptions->dontFlash(['token', 'secret', 'password', 'password_confirmation']);

        $exceptions->render(fn (ValidationException $e, Request $request): ?JsonResponse => $request->expectsJson() ? ApiErrorResponse::validation($e) : null);

        $exceptions->render(fn (AuthenticationException $e, Request $request): JsonResponse|RedirectResponse => $request->expectsJson()
            ? ApiErrorResponse::render($e)
            : redirect()->guest('/auth/login'));

        // A closed account is refused with the reference it is meant to quote and the message
        // written for it. The generic renderer would show the sentence and drop the metadata
        // the suspended-account page is built out of.
        $exceptions->render(function (AccountSuspendedException $e, Request $request): ?JsonResponse {
            if (! $request->expectsJson() && ! $request->is('api/*')) {
                return null;
            }

            $meta = $e->errorMeta();

            return new JsonResponse(
                ApiErrorResponse::toArray($e, $meta === [] ? [] : ['meta' => $meta]),
                $e->getStatusCode(),
            );
        });

        // These answer API routes in JSON even when the client does not ask for it.
        $exceptions->render(fn (DisplayException|DaemonConnectionException $e, Request $request): ?JsonResponse => $request->is('api/*')
            ? ApiErrorResponse::render($e)
            : null);

        $exceptions->render(fn (Throwable $e, Request $request): ?JsonResponse => $request->expectsJson() && ! $e instanceof HttpResponseException
            ? ApiErrorResponse::render($e)
            : null);
    })
    ->create();

// The panel's console kernel adds extension commands after its own. Artisan resolves the
// kernel before any provider registers, so it is bound here rather than in a provider.
$app->singleton(ConsoleKernelContract::class, Kernel::class);

if (isset($_ENV['APP_STORAGE_PATH'])) {
    $app->useStoragePath($_ENV['APP_STORAGE_PATH']);
}

return $app;
