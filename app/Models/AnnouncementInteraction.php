<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'announcement_id',
    'user_id',
    'version',
    'last_shown_at',
    'show_count',
    'acked_at',
    'dismissed_at',
])]
#[RouteKey('id')]
class AnnouncementInteraction extends Model
{
    public const string RESOURCE_NAME = 'announcement_interaction';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'announcement_id' => 'integer',
            'user_id' => 'integer',
            'version' => 'integer',
            'show_count' => 'integer',
            'last_shown_at' => 'datetime',
            'acked_at' => 'datetime',
            'dismissed_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Announcement, $this>
     */
    public function announcement(): BelongsTo
    {
        return $this->belongsTo(Announcement::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
