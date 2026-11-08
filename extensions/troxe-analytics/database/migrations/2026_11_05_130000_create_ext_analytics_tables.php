<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rollup, history and cursor tables owned by Troxe Analytics.
 *
 * Raw per-minute server samples are NOT duplicated here: they stay in the monitoring
 * extension's `ext_monitoring_samples`, which is this extension's high-resolution tier
 * for servers. Everything below is downsampled, so growth is bounded by the number of
 * resolution buckets rather than by the sample rate.
 *
 * `server_id`, `node_id` and `user_id` deliberately carry no foreign key. A customer's
 * history has to survive the deletion of their server; `ext_monitoring_samples` cascades
 * on server delete, so the rollups here are the only record that outlives a server.
 *
 * Each series table carries a `resolution` column rather than being split per tier, so
 * pruning and querying stay a single code path as tiers are added.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Incremental cursors. Reading forward from a primary key id or a byte offset is
        // what keeps collection cost proportional to new data instead of to table size —
        // `activity_logs` has no index on its timestamp column.
        Schema::create('ext_analytics_state', function (Blueprint $table): void {
            $table->string('key', 64)->primary();
            $table->text('value');
            $table->timestamp('updated_at')->nullable();
        });

        Schema::create('ext_analytics_server_series', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('node_id')->nullable();
            $table->dateTime('bucket');
            $table->string('resolution', 6);
            $table->unsignedInteger('samples')->default(0);
            $table->unsignedInteger('running_samples')->default(0);
            $table->unsignedInteger('restarts')->default(0);
            $table->float('cpu_avg')->default(0);
            $table->float('cpu_max')->default(0);
            $table->float('cpu_std')->default(0);
            $table->unsignedInteger('memory_avg')->default(0);
            $table->unsignedInteger('memory_max')->default(0);
            $table->unsignedInteger('memory_std')->default(0);
            $table->unsignedInteger('disk_max')->default(0);
            $table->unsignedBigInteger('rx_bytes')->default(0);
            $table->unsignedBigInteger('tx_bytes')->default(0);

            $table->unique(['server_id', 'resolution', 'bucket']);
            $table->index(['resolution', 'bucket']);
        });

        Schema::create('ext_analytics_node_series', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedInteger('node_id');
            $table->dateTime('bucket');
            $table->string('resolution', 6);
            $table->unsignedInteger('samples')->default(0);
            $table->unsignedInteger('servers')->default(0);
            $table->unsignedInteger('running')->default(0);
            $table->float('cpu_pct')->nullable();
            $table->float('load1')->nullable();
            $table->float('load5')->nullable();
            $table->float('load15')->nullable();
            $table->unsignedInteger('memory_used')->nullable();
            $table->unsignedInteger('memory_total')->nullable();
            $table->unsignedBigInteger('disk_used')->nullable();
            $table->unsignedBigInteger('disk_total')->nullable();
            $table->unsignedInteger('memory_allocated')->default(0);
            $table->unsignedInteger('disk_allocated')->default(0);
            $table->unsignedInteger('cpu_allocated')->default(0);
            // Tri-state: 1 answered, 0 refused, null when nothing was known yet — the
            // monitoring collector has not sampled a node that has never been reached.
            $table->boolean('reachable')->nullable();

            $table->unique(['node_id', 'resolution', 'bucket']);
            $table->index(['resolution', 'bucket']);
        });

        // Panel request volume and error mix, read from the nginx access log. That log
        // carries no timing field on this install, so no latency figure is stored or shown.
        Schema::create('ext_analytics_http_series', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->dateTime('bucket');
            $table->string('resolution', 6);
            $table->unsignedInteger('requests')->default(0);
            $table->unsignedInteger('errors_4xx')->default(0);
            $table->unsignedInteger('errors_5xx')->default(0);

            $table->unique(['resolution', 'bucket']);
        });

        Schema::create('ext_analytics_http_routes', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->dateTime('bucket');
            $table->string('route', 191);
            $table->unsignedInteger('requests')->default(0);
            $table->unsignedInteger('errors')->default(0);

            $table->unique(['bucket', 'route']);
            $table->index('bucket');
        });

        // Requests that are not part of the panel at all — scanner traffic probing for
        // WordPress, .env and .git. Kept apart so it neither pollutes the route breakdown
        // nor the error rate, but still visible as an exposure signal per source address.
        Schema::create('ext_analytics_http_probes', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->dateTime('bucket');
            $table->string('address', 45);
            $table->unsignedInteger('requests')->default(0);
            $table->unsignedInteger('rejected')->default(0);
            $table->string('sample_path', 191)->default('');

            $table->unique(['bucket', 'address']);
            $table->index('bucket');
        });

        // Hourly counts of the panel's own activity events. The rows themselves stay in
        // `activity_logs`, which is pruned; this table is what makes security trends
        // outlive that pruning.
        Schema::create('ext_analytics_security_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->dateTime('bucket');
            $table->string('event', 100);
            $table->unsignedInteger('occurrences')->default(0);

            $table->unique(['bucket', 'event']);
            $table->index('event');
        });

        // Daily census. `servers` and `users` are hard-deleted, so creation and deletion
        // trends over removed objects exist nowhere else. Every column here is a fact the
        // panel's own tables can still answer on the day it is taken — nothing is inferred.
        Schema::create('ext_analytics_snapshots_daily', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->date('bucket');
            $table->unsignedInteger('users_total')->default(0);
            $table->unsignedInteger('users_admin')->default(0);
            $table->unsignedInteger('users_2fa')->default(0);
            $table->unsignedInteger('servers_total')->default(0);
            $table->unsignedInteger('servers_suspended')->default(0);
            $table->unsignedInteger('servers_installing')->default(0);
            $table->unsignedInteger('servers_active')->default(0);
            $table->unsignedInteger('nodes_total')->default(0);
            $table->unsignedInteger('allocations_total')->default(0);
            $table->unsignedInteger('allocations_used')->default(0);
            $table->unsignedBigInteger('memory_allocated')->default(0);
            $table->unsignedBigInteger('disk_allocated')->default(0);
            $table->unsignedBigInteger('cpu_allocated')->default(0);
            $table->unsignedInteger('servers_created')->default(0);
            $table->unsignedInteger('servers_deleted')->default(0);
            $table->unsignedInteger('users_created')->default(0);

            $table->unique('bucket');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_analytics_snapshots_daily');
        Schema::dropIfExists('ext_analytics_security_events');
        Schema::dropIfExists('ext_analytics_http_probes');
        Schema::dropIfExists('ext_analytics_http_routes');
        Schema::dropIfExists('ext_analytics_http_series');
        Schema::dropIfExists('ext_analytics_node_series');
        Schema::dropIfExists('ext_analytics_server_series');
        Schema::dropIfExists('ext_analytics_state');
    }
};
