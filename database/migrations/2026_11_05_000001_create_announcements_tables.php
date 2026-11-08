<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Announcements: admin-authored notices shown in the user dashboard.
|
| Two tables only — additive, nothing here touches existing schema:
|  - announcements holds the content, publication state machine, target
|    audience, and repeat-display policy. content_version is bumped only by
|    material edits (title/body/kind/action/event window), never by admin-only
|    edits (name, audience, timing, policy), which is what makes "hide once"
|    survive page refreshes and re-logins without resurfacing on typos.
|  - announcement_interactions keys one row per (announcement, user, version),
|    which is the single source of truth for shown/acked/dismissed state —
|    it lives in the database, not in localStorage, so it follows the user
|    across devices and sessions. The unique index makes concurrent upserts
|    converge instead of duplicating.
|
| MariaDB: json is an alias of longtext with a validity check; enum-like
| columns are varchar + PHP backed enums + CHECK constraints (the codebase
| never uses native MySQL enums).
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table): void {
            $table->increments('id');
            // Internal admin-only label; never rendered to end users.
            $table->string('name', 100);
            $table->string('title', 140);
            // Plain text only — the client renders it as text, never HTML.
            $table->text('body');
            $table->string('kind', 20)->default('info');
            $table->string('status', 20)->default('draft');
            $table->string('policy', 20)->default('once');
            $table->boolean('require_ack')->default(false);
            // Required (1..2160) when policy = interval; null otherwise.
            $table->unsignedInteger('interval_hours')->nullable();
            // {"type":"all"} | {"type":"users","user_ids":[...]} — null means all.
            // Stored nullable because MariaDB longtext defaults are awkward; the
            // model layer always normalises null to {"type":"all"}.
            $table->json('audience')->nullable();
            $table->string('action_label', 40)->nullable();
            $table->string('action_url', 500)->nullable();
            $table->timestamp('event_start')->nullable();
            $table->timestamp('event_end')->nullable();
            $table->timestamp('publish_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->unsignedInteger('content_version')->default(1);
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index('status', 'announcements_status_index');
            $table->index('publish_at', 'announcements_publish_at_index');

            // Domain validity (kind/status/policy values, interval range) is
            // enforced by the PHP backed enums + request validation, matching
            // the rest of the schema; no native CHECK constraints are used
            // anywhere else in this panel's migrations.
        });

        Schema::create('announcement_interactions', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('announcement_id');
            $table->unsignedInteger('user_id');
            // Which content version this row describes; a version bump starts
            // a fresh row, it never rewrites history.
            $table->unsignedInteger('version');
            $table->timestamp('last_shown_at')->nullable();
            $table->unsignedInteger('show_count')->default(0);
            $table->timestamp('acked_at')->nullable();
            $table->timestamp('dismissed_at')->nullable();
            $table->timestamps();

            // One row per (announcement, user, version): concurrent requests
            // upsert onto this key instead of duplicating.
            $table->unique(['announcement_id', 'user_id', 'version'], 'announcement_ix_unique');
            $table->index('user_id', 'announcement_ix_user_index');

            $table->foreign('announcement_id')->references('id')->on('announcements')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_interactions');
        Schema::dropIfExists('announcements');
    }
};
