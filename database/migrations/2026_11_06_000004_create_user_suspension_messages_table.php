<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| The user-facing text of a suspension, one row per version.
|
| The requirement this table exists for: an administrator may correct the message an
| account holder is shown, and doing so must not change the record that was first shown.
| So a message is never updated — the first row is the message as it was issued, and a
| correction appends another. `user_suspensions` deliberately has no message column
| because a copy of the newest version there would be a second answer, and the two would
| drift the moment someone read the history.
|
| Which version a reader sees is a decision made at read time, not a stored flag: the
| account holder is shown the highest id, the history shows all of them in order. A
| `is_current` column could only be wrong, because "current" is exactly what the ordering
| already says.
|
| There is no `updated_at`: a row here is a quotation, and quotations do not change.
| Deleting the suspension deletes its messages with it, because a message without the
| decision it belonged to is not evidence of anything.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_suspension_messages', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('suspension_id');
            $table->text('message');
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamp('created_at')->useCurrent();

            // The history is read in this order, oldest first, and the current message is
            // the last row of it.
            $table->index(['suspension_id', 'id'], 'user_suspension_messages_version_index');

            $table->foreign('suspension_id')->references('id')->on('user_suspensions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_suspension_messages');
    }
};
