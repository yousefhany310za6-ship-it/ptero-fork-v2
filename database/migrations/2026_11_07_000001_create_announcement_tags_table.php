<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Announcement tags and display types: the branding half of the
| announcements system.
|
|  - announcement_tags is a small palette of reusable labels ("Warning",
|    "Maintenance", "Events", …) that an announcement is stamped with. The
|    colour is a plain hex string, validated and contrasted on the client, so
|    MariaDB only stores text; the optional icon is a Lucide icon name.
|  - announcements gains display_type (banner | modal) and tag_id. tag_id is
|    nullable — an untagged announcement keeps the kind-based look it always
|    had — and set null on delete so removing a tag never orphans the notices
|    it branded.
|
| MariaDB: varchar + PHP backed enums, matching the panel's other migrations.
*/

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcement_tags', function (Blueprint $table): void {
            $table->increments('id');
            // Reverses the wording rules of announcements: visible to end users.
            $table->string('name', 60);
            // A plain #rrggbb string; the client derives readable text colour.
            $table->string('color', 7);
            // Optional Lucide icon name, resolved by the front end.
            $table->string('icon', 60)->nullable();
            $table->timestamps();

            // Labels are short by nature; the unique index also gives admins a
            // predictable resource while muting tag-name padding.
            $table->unique('name', 'announcement_tags_name_unique');
        });

        Schema::table('announcements', function (Blueprint $table): void {
            $table->string('display_type', 20)->default('banner')->after('kind');
            $table->unsignedInteger('tag_id')->nullable()->after('display_type');

            $table->foreign('tag_id')->references('id')->on('announcement_tags')->nullOnDelete();
            $table->index('tag_id', 'announcements_tag_index');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table): void {
            $table->dropForeign(['tag_id']);
            $table->dropIndex('announcements_tag_index');
            $table->dropColumn(['display_type', 'tag_id']);
        });

        Schema::dropIfExists('announcement_tags');
    }
};
