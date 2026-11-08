<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Sign-in history: one row per attempt on the authentication path, successful or not.
|
| The address is the same 16-byte normalised form the ban table uses, so an attempt
| recorded as `203.0.2.135` and one recorded as `::ffff:203.0.2.135` are the same bytes
| and the same row an administrator finds when searching that address. Nothing here
| stores a family flag or a printed address: both fall out of the bytes, and a stored
| copy of a derived value is a second answer that can be wrong while the bytes are right.
|
| `user_id` carries no foreign key on purpose. History is evidence, and evidence that
| vanishes when an account is deleted is evidence the panel loses at the worst moment —
| usually the moment the account is deleted because of what the rows describe. The uuid
| is kept beside it because the numeric id is what a deleted account leaves no trace of.
|
| `username_attempted` is stored even when no such account exists. That column is the
| only way to see an enumeration run: one address, many names, all failures.
|
| `ip_ban_id` names the ban that refused the attempt, without a constraint of its own, so
| the row still says which rule applied after an administrator lifts that ban and the ban
| row itself is gone.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('login_events', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id')->nullable();
            $table->char('user_uuid', 36)->nullable();
            $table->string('username_attempted', 191)->nullable();
            $table->binary('ip_address', 16)->nullable();
            $table->string('outcome', 24);
            $table->string('reason_code', 32)->nullable();
            $table->unsignedInteger('ip_ban_id')->nullable();
            $table->char('suspension_case_id', 6)->nullable();
            $table->string('user_agent', 1000)->nullable();
            // sha256 of the client's own description of itself. One way, and only ever
            // written here: it groups attempts from one browser without storing the
            // headers that produced it in a readable form.
            $table->char('fingerprint', 64)->nullable();
            $table->timestamp('created_at')->useCurrent();

            // Every read of this table is "the newest rows matching X", and id rises with
            // time, so each index ends on id rather than on created_at.
            $table->index(['ip_address', 'id'], 'login_events_ip_index');
            $table->index(['user_id', 'id'], 'login_events_user_index');
            $table->index(['outcome', 'id'], 'login_events_outcome_index');
            // Retention is the one query that walks by date, and it walks it often.
            $table->index('created_at', 'login_events_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_events');
    }
};
