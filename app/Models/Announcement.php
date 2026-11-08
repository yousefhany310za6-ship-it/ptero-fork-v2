<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Database\Factories\AnnouncementFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Pterodactyl\Enum\AnnouncementDisplayPolicy;
use Pterodactyl\Enum\AnnouncementDisplayType;
use Pterodactyl\Enum\AnnouncementKind;
use Pterodactyl\Enum\AnnouncementStatus;

#[Fillable([
    'name',
    'title',
    'body',
    'kind',
    'display_type',
    'tag_id',
    'status',
    'policy',
    'require_ack',
    'interval_hours',
    'audience',
    'action_label',
    'action_url',
    'event_start',
    'event_end',
    'publish_at',
    'expires_at',
    'published_at',
    'content_version',
    'created_by',
])]
#[RouteKey('id')]
class Announcement extends Model
{
    /** @use HasFactory<AnnouncementFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'announcement';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => AnnouncementKind::class,
            'display_type' => AnnouncementDisplayType::class,
            'status' => AnnouncementStatus::class,
            'policy' => AnnouncementDisplayPolicy::class,
            'require_ack' => 'boolean',
            'interval_hours' => 'integer',
            'content_version' => 'integer',
            'audience' => 'array',
            'event_start' => 'datetime',
            'event_end' => 'datetime',
            'publish_at' => 'datetime',
            'expires_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @return BelongsTo<AnnouncementTag, $this>
     */
    public function tag(): BelongsTo
    {
        return $this->belongsTo(AnnouncementTag::class, 'tag_id');
    }

    /**
     * @return HasMany<AnnouncementInteraction, $this>
     */
    public function interactions(): HasMany
    {
        return $this->hasMany(AnnouncementInteraction::class, 'announcement_id');
    }

    /**
     * Audience selector, normalised: a missing/null payload means everyone.
     *
     * @return array{type: string, user_ids: list<int>}
     */
    public function audienceSelector(): array
    {
        /** @var array{type?: string, user_ids?: list<int>} $audience */
        $audience = $this->audience ?? [];

        $userIds = [];
        foreach ($audience['user_ids'] ?? [] as $id) {
            $userIds[] = (int) $id;
        }

        return [
            'type' => $audience['type'] ?? 'all',
            'user_ids' => $userIds,
        ];
    }
}
