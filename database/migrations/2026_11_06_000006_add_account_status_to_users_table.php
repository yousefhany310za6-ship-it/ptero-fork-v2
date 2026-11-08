<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| The one column that says whether an account may use the panel.
|
| This is deliberately the only suspension fact kept on `users`. It is read on every
| authenticated request, so it has to be a column on the row the session already loads,
| not a join to `user_suspensions` that turns every page into a lookup. Everything that
| explains the status — reason, message, expiry, who did it — is in that table, and this
| column is written by no code except the suspend and unsuspend actions, in a
| transaction with the row they belong to.
|
| Defaulting to `active` is what makes the migration safe to deploy: every existing
| account, and every account that will ever be created without saying otherwise, is
| active, so nothing changes about a single row that already exists. It also means a
| status this panel does not recognise cannot be silently stored: the only two values are
| the two the enum knows, and anything else fails on write.
|
| A `varchar` rather than a database enum, as everywhere else in this fork: a value that
| only the schema knows how to spell has to be changed in two places, and the schema is
| not the one that has to be right.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('account_status', 20)->default('active')->after('root_admin');
            // The user list is filtered by status before it is filtered by anything else.
            $table->index('account_status', 'users_account_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_account_status_index');
            $table->dropColumn('account_status');
        });
    }
};
