<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Announcements;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Actions\Announcements\CreateAnnouncement;
use Pterodactyl\Actions\Announcements\DeleteAnnouncement;
use Pterodactyl\Actions\Announcements\SetAnnouncementPublishState;
use Pterodactyl\Actions\Announcements\UpdateAnnouncement;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\ArchiveAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\DeleteAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\GetAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\GetAnnouncementsRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\PauseAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\PublishAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\ScheduleAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\StoreAnnouncementRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\UpdateAnnouncementRequest;
use Pterodactyl\Http\Resources\Api\Admin\AnnouncementResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Services\Announcements\AnnouncementStatsService;
use Spatie\QueryBuilder\QueryBuilder;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Announcements', 'Admin-authored notices displayed in the user dashboard.')]
class AnnouncementController extends AdminApiController
{
    /**
     * List announcements.
     */
    #[Endpoint('List announcements', 'Returns a paginated list of announcements in any state.')]
    #[QueryParam('filter[status]', 'string', 'draft|scheduled|published|paused|archived', required: false, example: 'published')]
    #[QueryParam('filter[kind]', 'string', 'info|success|warning|critical', required: false, example: 'critical')]
    #[QueryParam('sort', 'string', 'Sort by id, title, status, kind, publish_at, expires_at, created_at, or updated_at. Prefix with a hyphen for descending.', required: false, example: '-updated_at')]
    #[QueryParam('page', 'integer', 'Page number to return.', required: false, example: 1)]
    #[QueryParam('per_page', 'integer', 'Results to return per page.', required: false, example: 50)]
    public function index(GetAnnouncementsRequest $request): ApiResourceCollection
    {
        $announcements = QueryBuilder::for(Announcement::query()->with('tag'))
            ->allowedFilters(['status', 'kind'])
            ->allowedSorts(['id', 'title', 'status', 'kind', 'publish_at', 'expires_at', 'created_at', 'updated_at'])
            ->defaultSort('-updated_at')
            ->paginate($request->perPage());

        return AnnouncementResource::collection($announcements);
    }

    /**
     * Show announcement.
     */
    #[Endpoint('Get announcement', 'Returns a single announcement, including admin-only fields.')]
    public function show(GetAnnouncementRequest $request, Announcement $announcement): AnnouncementResource
    {
        return AnnouncementResource::make($announcement);
    }

    /**
     * Create announcement (always starts as a draft).
     */
    #[Endpoint('Create announcement', 'Creates a draft announcement. Publication is a separate audited action.')]
    public function store(StoreAnnouncementRequest $request, CreateAnnouncement $creator): JsonResponse
    {
        $announcement = $creator->create($request->actionInput(), $request->user()->id);

        Activity::event('admin:announcement.create')
            ->subject($announcement)
            ->property('name', $announcement->name)
            ->log();

        return AnnouncementResource::make($announcement)
            ->withMeta([
                'resource' => route('api.admin.announcements.view', ['announcement' => $announcement->id]),
            ])
            ->respond(Response::HTTP_CREATED);
    }

    /**
     * Update announcement.
     */
    #[Endpoint('Update announcement', 'Patches an announcement. A material content edit bumps content_version so the banner resurfaces; admin-only edits never do.')]
    public function update(UpdateAnnouncementRequest $request, UpdateAnnouncement $updater, Announcement $announcement): AnnouncementResource
    {
        $versionBefore = $announcement->content_version;
        $announcement = $updater->update($announcement, $request->actionInput());

        Activity::event('admin:announcement.update')
            ->subject($announcement)
            ->property('version_bump', $announcement->content_version !== $versionBefore)
            ->property('content_version', $announcement->content_version)
            ->log();

        return AnnouncementResource::make($announcement);
    }

    /**
     * Publish now.
     */
    #[Endpoint('Publish announcement', 'Moves draft/scheduled/paused to published; the window opens immediately when no explicit start was set.')]
    public function publish(PublishAnnouncementRequest $request, SetAnnouncementPublishState $state, Announcement $announcement): AnnouncementResource
    {
        $announcement = $state->publish($announcement);

        Activity::event('admin:announcement.publish')
            ->subject($announcement)
            ->log();

        return AnnouncementResource::make($announcement);
    }

    /**
     * Schedule publication.
     */
    #[Endpoint('Schedule announcement', 'Moves draft/paused to scheduled for a future time. Never displays before its time.')]
    public function schedule(ScheduleAnnouncementRequest $request, SetAnnouncementPublishState $state, Announcement $announcement): AnnouncementResource
    {
        /** @var string $publishAtRaw validated as a required date above */
        $publishAtRaw = $request->input('publish_at');
        $publishAt = CarbonImmutable::parse($publishAtRaw);
        $announcement = $state->schedule($announcement, $publishAt);

        Activity::event('admin:announcement.schedule')
            ->subject($announcement)
            ->property('publish_at', $publishAt->toIso8601String())
            ->log();

        return AnnouncementResource::make($announcement);
    }

    /**
     * Pause announcement.
     */
    #[Endpoint('Pause announcement', 'Hides a published or scheduled announcement until it is published again.')]
    public function pause(PauseAnnouncementRequest $request, SetAnnouncementPublishState $state, Announcement $announcement): AnnouncementResource
    {
        $announcement = $state->pause($announcement);

        Activity::event('admin:announcement.pause')
            ->subject($announcement)
            ->log();

        return AnnouncementResource::make($announcement);
    }

    /**
     * Archive announcement.
     */
    #[Endpoint('Archive announcement', 'Read-only end state that keeps statistics attached to the row.')]
    public function archive(ArchiveAnnouncementRequest $request, SetAnnouncementPublishState $state, Announcement $announcement): AnnouncementResource
    {
        $announcement = $state->archive($announcement);

        Activity::event('admin:announcement.archive')
            ->subject($announcement)
            ->log();

        return AnnouncementResource::make($announcement);
    }

    /**
     * Delete announcement.
     */
    #[Endpoint('Delete announcement', 'Deletes an announcement. Published rows must be paused or archived first.')]
    public function destroy(DeleteAnnouncementRequest $request, DeleteAnnouncement $deleter, Announcement $announcement): Response
    {
        Activity::event('admin:announcement.delete')
            ->subject($announcement)
            ->property('name', $announcement->name)
            ->log();

        $deleter->handle($announcement);

        return $this->returnNoContent();
    }

    /**
     * Announcement stats.
     *
     * @return array{content_version: int, eligible: int, shown: int, acked: int, dismissed: int}
     */
    #[Endpoint('Announcement stats', 'Audience, views, acknowledgements, and dismissals for the current content version.')]
    public function stats(GetAnnouncementRequest $request, Announcement $announcement, AnnouncementStatsService $stats): array
    {
        return $stats->for($announcement);
    }
}
