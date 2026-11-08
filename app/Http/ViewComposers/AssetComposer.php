<?php

declare(strict_types=1);

namespace Pterodactyl\Http\ViewComposers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;
use Pterodactyl\Captcha\CaptchaVerifier;
use Pterodactyl\Services\Extensions\ExtensionHeadTags;
use Pterodactyl\Services\Extensions\ExtensionRepository;
use Pterodactyl\Services\Helpers\AssetHashService;
use Pterodactyl\Services\Themes\ThemeResolver;
use Throwable;

class AssetComposer
{
    /**
     * AssetComposer constructor.
     */
    public function __construct(
        private readonly AssetHashService $assetHashService,
        private readonly ExtensionRepository $extensions,
        private readonly ExtensionHeadTags $extensionHeadTags,
        private readonly ThemeResolver $themes,
        private readonly Request $request,
        private readonly CaptchaVerifier $captcha,
    ) {}

    /**
     * Provide access to the asset service in the views.
     */
    public function compose(View $view): void
    {
        $theme = $this->themes->document($this->request);

        $view->with('asset', $this->assetHashService);
        // Rendered lazily by the layout; resolving the tags never throws.
        $view->with('extensionHead', $this->extensionHeadTags);
        $view->with('theme', $theme);
        $view->with('siteConfiguration', [
            'name' => config('app.name', 'Pterodactyl'),
            'locale' => config('app.locale', 'en'),
            'recaptcha' => [
                'enabled' => config('recaptcha.enabled', false),
                'siteKey' => config('recaptcha.website_key', ''),
            ],
            // Which provider answers, and only its public half. Publishing it can never be the
            // reason a page fails; a request is still checked by the middleware whichever way this goes.
            'captcha' => $this->captchaPayload(),
            // Safe mode loads no extension bundles at all.
            'extensions' => $theme->safeMode ? [] : $this->extensionPayload(array_column($theme->chain, 'id')),
            'theme' => $theme->bootstrap(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function captchaPayload(): array
    {
        try {
            return $this->captcha->widgetConfiguration();
        } catch (Throwable $exception) {
            // Nothing renders a widget, so nothing can be verified from this page. That is a failed
            // login, not a bypassed one: the middleware still refuses what it cannot prove.
            Log::error('[captcha] The widget configuration could not be published.', ['exception' => $exception]);

            return ['enabled' => false, 'actions' => []];
        }
    }

    /**
     * The enabled frontend extensions the SPA boot loader should import, with their
     * frontend settings for signed-in users and only the public ones for guests, and
     * the themes of the chain the page renders with. Never allowed to break page
     * rendering - worst case the SPA sees no extensions.
     *
     * @param  list<string>  $themes
     * @return array<int, array{id: string, version?: string, entry: string}>
     */
    private function extensionPayload(array $themes): array
    {
        if (! config('extensions.enabled')) {
            return [];
        }

        try {
            return $this->extensions->frontendPayload(authenticated: Auth::check(), themes: $themes);
        } catch (Throwable) {
            return [];
        }
    }
}
