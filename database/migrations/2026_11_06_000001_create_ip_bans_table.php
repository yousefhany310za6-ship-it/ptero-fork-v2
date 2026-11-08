<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| IP bans: addresses refused access to the panel, independent of any account.
|
| A ban covers a range, held as its first and last address in one 16-byte space:
| an IPv4 address is stored in its IPv4-mapped IPv6 form, so a client arriving as
| `::ffff:203.0.2.135` is the same bytes as `203.0.2.135` and cannot walk past a
| ban written in the other notation. Matching is `first_ip <= x <= last_ip` on
| those bytes, so no formatting variant of an address is a different address.
|
| There is no family column. It would be derivable from the bytes, and a stored
| copy of a derived value is a second answer to the same question — one that can
| be wrong while the bytes are right.
|
| Nothing here references a user. A ban is on an address, so suspending or deleting
| an account never lifts one, and a shared address never reaches into accounts that
| do not use it. `created_by` is nullable for the same reason history should outlive
| the administrator: if the account that set a ban is deleted, the ban stays.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ip_bans', function (Blueprint $table): void {
            $table->increments('id');
            // varbinary(16): MySQL compares these byte-wise without padding, which is the
            // ordering the range test relies on.
            $table->binary('first_ip', 16);
            $table->binary('last_ip', 16);
            // What the administrator typed, kept for display only. Enforcement reads the
            // two byte columns, never this text.
            $table->string('cidr_label', 96)->nullable();
            $table->string('reason', 500);
            // A permanent ban is simply one with no end: one column, so a row can never
            // claim to be permanent and expired at the same time.
            $table->timestamp('expires_at')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            // Re-banning the same range converges onto this row instead of stacking
            // duplicates that would all have to be lifted one by one.
            $table->unique(['first_ip', 'last_ip'], 'ip_bans_range_unique');
            $table->index('expires_at', 'ip_bans_expires_at_index');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ip_bans');
    }
};
