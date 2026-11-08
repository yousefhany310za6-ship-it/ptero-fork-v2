<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ext_monitoring_samples', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedInteger('server_id');
            $table->timestamp('sampled_at');
            $table->unsignedTinyInteger('state');
            $table->float('cpu');
            $table->unsignedInteger('memory');
            $table->unsignedInteger('disk');
            $table->unsignedBigInteger('rx');
            $table->unsignedBigInteger('tx');

            $table->index(['server_id', 'sampled_at']);
            $table->index('sampled_at');
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        Schema::create('ext_monitoring_channels', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->string('name', 64);
            $table->string('type', 16);
            $table->text('config');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // Rules without a server apply to every server and are managed by administrators.
        Schema::create('ext_monitoring_rules', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('server_id')->nullable();
            $table->unsignedInteger('user_id');
            $table->string('metric', 16);
            $table->unsignedInteger('threshold')->default(0);
            $table->unsignedInteger('minutes')->default(5);
            $table->unsignedInteger('cooldown')->default(60);
            $table->boolean('enabled')->default(true);
            $table->json('channels');
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('ext_monitoring_alerts', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('rule_id');
            $table->unsignedInteger('server_id')->nullable();
            $table->unsignedInteger('node_id')->nullable();
            $table->float('value');
            $table->float('peak');
            $table->timestamp('started_at');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->unsignedInteger('acknowledged_by')->nullable();
            $table->timestamp('notified_at')->nullable();

            $table->index(['rule_id', 'resolved_at']);
            $table->index(['server_id', 'started_at']);
            $table->foreign('rule_id')->references('id')->on('ext_monitoring_rules')->cascadeOnDelete();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('node_id')->references('id')->on('nodes')->cascadeOnDelete();
        });

        Schema::create('ext_monitoring_pushes', function (Blueprint $table): void {
            $table->unsignedInteger('server_id')->primary();
            $table->text('url');
            $table->boolean('last_up')->nullable();
            $table->string('last_error', 191)->nullable();
            $table->timestamp('pushed_at')->nullable();
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_monitoring_pushes');
        Schema::dropIfExists('ext_monitoring_alerts');
        Schema::dropIfExists('ext_monitoring_rules');
        Schema::dropIfExists('ext_monitoring_channels');
        Schema::dropIfExists('ext_monitoring_samples');
    }
};
