<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| What happened to each of a suspended account's servers.
|
| Suspending an account suspends the servers it owns, and that is N calls to Wings rather
| than one: a node can be offline, a server can be mid-transfer, one can already be
| suspended. So the outcome is recorded per server. The alternative — storing a single
| "servers stopped" flag on the suspension — would claim something the daemon may never
| have accepted, which is the one thing this table exists to prevent.
|
| `wings_state_before` is the power state the daemon reported for that server immediately
| before it was suspended, kept because an administrator asking "did suspending this
| account interrupt something?" needs the answer. It is evidence, not an instruction:
| lifting a suspension never reads it and never sends a power signal, because a server
| that was stopped before the suspension would otherwise be started by someone who only
| meant to unlock the account.
|
| A server that is deleted later keeps its row here, identified by `server_uuid`, which is
| why `server_id` carries no foreign key: the record of what was stopped is part of the
| suspension's history, and history does not depend on the thing still existing.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_suspension_servers', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('suspension_id');
            $table->unsignedInteger('server_id');
            $table->char('server_uuid', 36);
            // Quoted from the daemon, in whatever words it used. Deliberately not an enum:
            // this is a transcript of an outside system, and a value Wings adds later is
            // still worth recording.
            $table->string('wings_state_before', 32)->nullable();
            $table->string('outcome', 24);
            // Only ever the class name of what went wrong. A daemon exception message quotes
            // the request that produced it, and a request to Wings carries the node token —
            // neither belongs in a record an administrator can read back.
            $table->string('failure', 500)->nullable();
            $table->timestamps();

            // One row per server per suspension, so a retried suspension updates the
            // attempt it already made rather than stacking a second claim about it.
            $table->unique(['suspension_id', 'server_id'], 'user_suspension_servers_per_server_unique');
            $table->index('server_uuid', 'user_suspension_servers_uuid_index');

            $table->foreign('suspension_id')->references('id')->on('user_suspensions')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_suspension_servers');
    }
};
