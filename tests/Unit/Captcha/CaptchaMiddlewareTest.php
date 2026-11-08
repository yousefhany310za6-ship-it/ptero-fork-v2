<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Captcha\CaptchaVerifier;
use Pterodactyl\Captcha\Rules\RuleRepository;
use Pterodactyl\Http\Middleware\VerifyCaptcha;
use Symfony\Component\HttpKernel\Exception\HttpException;

uses(RefreshDatabase::class);

function captchaMiddleware(): VerifyCaptcha
{
    return app(VerifyCaptcha::class);
}

function reachedHandler(): Closure
{
    return fn (Request $request): Response => new Response('reached handler', 299);
}

function routeWith(array $middleware, string $uri = '/probe'): Route
{
    $route = new Route(['POST'], $uri, fn () => null);

    if ($middleware !== []) {
        $route->middleware($middleware);
    }

    return $route;
}

function requestThrough(?Route $route, array $body = []): Request
{
    $request = Request::create('http://localhost/probe', 'POST', $body);

    if ($route !== null) {
        $request->setRouteResolver(fn () => $route);
    }

    return $request;
}

it('stands aside when the route declares its own captcha middleware', function (): void {
    app(RuleRepository::class)->save([
        'probe.endpoint' => ['path' => 'probe', 'methods' => ['POST'], 'required' => true],
    ]);

    Http::fake();

    foreach (['captcha:auth.login', 'recaptcha'] as $declared) {
        $request = requestThrough(routeWith([$declared]));
        $fresh = app(VerifyCaptcha::class);

        expect($fresh->handle($request, reachedHandler())->getStatusCode())->toBe(299);
    }

    Http::assertNothingSent();
});

it('enforces a data-defined rule on a route that never mentions captcha', function (): void {
    app(RuleRepository::class)->save([
        'probe.endpoint' => ['path' => 'probe', 'methods' => ['POST'], 'required' => true],
    ]);

    Http::fake();

    expect(fn () => captchaMiddleware()->handle(requestThrough(routeWith([])), reachedHandler()))
        ->toThrow(HttpException::class);
});

it('lets requests no rule claims continue untouched', function (): void {
    $response = captchaMiddleware()->handle(requestThrough(routeWith([])), reachedHandler());

    expect($response->getStatusCode())->toBe(299);
});

it('does not trip on a request that matched no route', function (): void {
    $response = captchaMiddleware()->handle(requestThrough(null), reachedHandler());

    expect($response->getStatusCode())->toBe(299);
});

it('verifies when the action is named explicitly, whatever the route says', function (): void {
    Http::fake();

    $request = requestThrough(routeWith([]));

    expect(fn () => captchaMiddleware()->handle($request, reachedHandler(), 'auth.login'))
        ->toThrow(HttpException::class);
});

it('the verifier proves a request once and never again', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => true, 'hostname' => 'localhost']),
    ]);

    $verifier = app(CaptchaVerifier::class);
    $request = Request::create('http://localhost/probe', 'POST', ['g-recaptcha-response' => 'once-'.uniqid()]);

    $verifier->check($request, 'auth.login');
    $verifier->check($request, 'auth.login');
    $verifier->check($request, 'auth.login');

    Http::assertSentCount(1);
});
