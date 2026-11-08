<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Restricted Environment
    |--------------------------------------------------------------------------
    |
    | Set this environment variable to true to enable a restricted configuration
    | setup on the panel. When set to true, configurations stored in the
    | database will not be applied.
    */

    'load_environment_only' => (bool) env('APP_ENVIRONMENT_ONLY', false),

    /*
    |--------------------------------------------------------------------------
    | Service Author
    |--------------------------------------------------------------------------
    |
    | Each panel installation is assigned a unique UUID to identify the
    | author of custom services, and make upgrades easier by identifying
    | standard Pterodactyl shipped services.
    */

    'service' => [
        'author' => env('APP_SERVICE_AUTHOR', 'unknown@unknown.com'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    |
    | Should login success and failure events trigger an email to the user?
    */

    'auth' => [
        '2fa_required' => (int) env('APP_2FA_REQUIRED', 0),
        '2fa' => [
            'bytes' => 32,
            'window' => (int) env('APP_2FA_WINDOW', 4),
            'verify_newer' => true,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    |
    | Certain pagination result counts can be configured here and will take
    | effect globally.
    */

    'paginate' => [
        'frontend' => [
            'servers' => (int) env('APP_PAGINATE_FRONT_SERVERS', 15),
        ],
        'admin' => [
            'servers' => (int) env('APP_PAGINATE_ADMIN_SERVERS', 25),
            'users' => (int) env('APP_PAGINATE_ADMIN_USERS', 25),
        ],
        'api' => [
            'nodes' => (int) env('APP_PAGINATE_API_NODES', 25),
            'servers' => (int) env('APP_PAGINATE_API_SERVERS', 25),
            'users' => (int) env('APP_PAGINATE_API_USERS', 25),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Guzzle Connections
    |--------------------------------------------------------------------------
    |
    | Configure the timeout to be used for Guzzle connections here.
    */

    'guzzle' => [
        'timeout' => (int) env('GUZZLE_TIMEOUT', 15),
        'connect_timeout' => (int) env('GUZZLE_CONNECT_TIMEOUT', 5),
    ],

    /*
    |--------------------------------------------------------------------------
    | CDN
    |--------------------------------------------------------------------------
    |
    | Information for the panel to use when contacting the CDN to confirm
    | if panel is up to date.
    */

    'cdn' => [
        'cache_time' => 60,
        'url' => 'https://cdn.pterodactyl.io/releases/latest.json',
    ],

    /*
    |--------------------------------------------------------------------------
    | Client Features
    |--------------------------------------------------------------------------
    |
    | Allow clients to create their own databases.
    */

    'client_features' => [
        'databases' => [
            'enabled' => (bool) env('PTERODACTYL_CLIENT_DATABASES_ENABLED', true),
            'allow_random' => (bool) env('PTERODACTYL_CLIENT_DATABASES_ALLOW_RANDOM', true),
        ],

        'schedules' => [
            // The total number of tasks that can exist for any given schedule at once.
            'per_schedule_task_limit' => (int) env('PTERODACTYL_PER_SCHEDULE_TASK_LIMIT', 10),
        ],

        'allocations' => [
            'enabled' => (bool) env('PTERODACTYL_CLIENT_ALLOCATIONS_ENABLED', false),
            'range_start' => env('PTERODACTYL_CLIENT_ALLOCATIONS_RANGE_START'),
            'range_end' => env('PTERODACTYL_CLIENT_ALLOCATIONS_RANGE_END'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | File Editor
    |--------------------------------------------------------------------------
    |
    | This array includes the MIME filetypes that can be edited via the web.
    */

    'files' => [
        'max_edit_size' => (int) env('PTERODACTYL_FILES_MAX_EDIT_SIZE', 1024 * 1024 * 4),
    ],

    /*
    |--------------------------------------------------------------------------
    | Dynamic Environment Variables
    |--------------------------------------------------------------------------
    |
    | Place dynamic environment variables here that should be auto-appended
    | to server environment fields when the server is created or updated.
    |
    | Items should be in 'key' => 'value' format, where key is the environment
    | variable name, and value is the server-object key. For example:
    |
    | 'P_SERVER_CREATED_AT' => 'created_at'
    */

    'environment_variables' => [
        'P_SERVER_ALLOCATION_LIMIT' => 'allocation_limit',
    ],

    /*
    |--------------------------------------------------------------------------
    | Asset Verification
    |--------------------------------------------------------------------------
    |
    | This section controls the output format for JS & CSS assets.
    */

    'assets' => [
        'use_hash' => (bool) env('PTERODACTYL_USE_ASSET_HASH', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Email Notification Settings
    |--------------------------------------------------------------------------
    |
    | This section controls what notifications are sent to users.
    */

    'email' => [
        // Should an email be sent to a server owner once their server has completed it's first install process?
        'send_install_notification' => (bool) env('PTERODACTYL_SEND_INSTALL_NOTIFICATION', true),
        // Should an email be sent to a server owner whenever their server is reinstalled?
        'send_reinstall_notification' => (bool) env('PTERODACTYL_SEND_REINSTALL_NOTIFICATION', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Telemetry Settings
    |--------------------------------------------------------------------------
    |
    | This section controls the telemetry sent by Pterodactyl.
    */

    'telemetry' => [
        'enabled' => (bool) env('PTERODACTYL_TELEMETRY_ENABLED', true),
    ],

    'features' => [
        'new_server_identifiers' => (bool) env('PTERODACTYL_USE_SERVER_IDENTIFIERS', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Security and Enforcement
    |--------------------------------------------------------------------------
    |
    | Which proxies may be believed is decided in config/trustedproxy.php, whose 'proxies'
    | key the framework's own TrustProxies middleware reads on every request; it refuses '*'
    | and '**' because a ban keyed on a forgeable header is walked past by anyone who types
    | a header. While that key is empty, as it is for a panel nginx serves directly, the
    | connecting socket is the client and X-Forwarded-For and CF-Connecting-IP are ignored
    | for every ban, history and rate-limit decision.
    */
    'security' => [
        // Days of sign-in history kept before the prune command deletes rows. Addresses
        // are collected for account security only: they are written to the login history
        // and the activity log, never to the panel's general log files.
        'login_ip_retention_days' => (int) env('PTERODACTYL_LOGIN_IP_RETENTION_DAYS', 365),

        // Lift a temporary suspension once it expires, or wait for an administrator. The
        // scheduled command is registered either way and does nothing while this is off.
        'auto_lift_expired' => (bool) env('PTERODACTYL_AUTO_LIFT_EXPIRED', false),

        // A banned address is refused at sign-in regardless of this setting. Turning it
        // on also refuses API requests from that address, which locks out integrations
        // that legitimately run there, so it is off by default.
        'ban_blocks_api_requests' => (bool) env('PTERODACTYL_BAN_BLOCKS_API_REQUESTS', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Support Contact
    |--------------------------------------------------------------------------
    |
    | Offered to an account holder whose access has been suspended. Anything set here is
    | shown publicly, so it must never contain a suspension reason, an administrator's
    | name, or an address — those stay in the admin interface.
    */

    'support' => [
        'email' => env('PTERODACTYL_SUPPORT_EMAIL', env('APP_SERVICE_AUTHOR', 'unknown@unknown.com')),
        'discord_url' => env('PTERODACTYL_SUPPORT_DISCORD_URL', ''),
    ],
];
