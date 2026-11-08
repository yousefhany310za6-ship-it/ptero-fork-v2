<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'color', 'icon'])]
#[RouteKey('id')]
class AnnouncementTag extends Model
{
    public const string RESOURCE_NAME = 'announcement_tag';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => 'string',
            'color' => 'string',
            'icon' => 'string',
        ];
    }

    /**
     * @return HasMany<Announcement, $this>
     */
    public function announcements(): HasMany
    {
        return $this->hasMany(Announcement::class, 'tag_id');
    }
}
