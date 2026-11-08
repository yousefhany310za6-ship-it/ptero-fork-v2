<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Account suspensions: the record of why an account stopped being able to sign in.
|
| A suspension is a historical event, not a flag. Everything that explains it — the
| reason, the note only administrators read, the moment a temporary one may be lifted,
| who did it and who lifted it — lives here, in a row that is never rewritten. The
| account itself carries one column (`account_status`) because that is read on every
| request; this table is read when someone asks what happened.
|
| The reason the message is not a column here is the panel's own rule for history: the
| requirement is that a user-facing message can be corrected without changing the record
| that was first shown. That is only possible if the message has its own table of
| versions (see `user_suspension_messages`), so this row names no message at all.
|
| `expires_at` does not mean the suspension stops applying by itself. Enforcement reads
| `users.account_status` and nothing else — one answer, so a request path can never
| disagree with this record. Whether the moment arrives on its own is the
| `pterodactyl.security.auto_lift_expired` setting, which runs a scheduled command that
| lifts the row and flips the account back. With it off, an expired suspension waits for
| an administrator, and the UI says so rather than calling it live forever.
|
| `user_id` has no foreign key, for the same reason `login_events.user_id` has none: the
| record of what was done to an account must outlive the account. Auto-increment never
| reuses an id, so an orphaned row can never be re-attached to someone else.
|
| `support_case_id` is unique across the whole table, not per account: it is the string a
| user reads off a page and pastes into a support ticket, and two suspensions answering
| to one reference would make it worth nothing.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_suspensions', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->char('support_case_id', 6);
            // Which kind of violation this was, from the fixed list the panel offers. The
            // words that explain it to the account holder are in the messages table; this
            // column exists so suspensions can be counted and filtered by cause.
            $table->string('reason', 32);
            // Read by administrators only. It is never in a response the account holder can
            // reach, in any form — see UserSuspensionResource.
            $table->text('internal_note')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->unsignedInteger('lifted_by')->nullable();
            $table->timestamp('lifted_at')->nullable();
            $table->timestamps();

            $table->unique('support_case_id', 'user_suspensions_case_unique');
            // The two questions asked of this table: what is still hanging over this
            // account, and what is waiting to be lifted.
            $table->index(['user_id', 'lifted_at'], 'user_suspensions_account_index');
            $table->index('expires_at', 'user_suspensions_expires_at_index');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('lifted_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_suspensions');
    }
};
