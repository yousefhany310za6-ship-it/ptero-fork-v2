<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Announcements;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\DeleteAnnouncementTagRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\GetAnnouncementTagRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\GetAnnouncementTagsRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\StoreAnnouncementTagRequest;
use Pterodactyl\Http\Requests\Api\Admin\Announcements\UpdateAnnouncementTagRequest;
use Pterodactyl\Http\Resources\Api\Admin\AnnouncementTagResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\AnnouncementTag;
use Spatie\QueryBuilder\QueryBuilder;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Announcement Tags', 'Reusable labels with a colour and icon that brand announcements.')]
class AnnouncementTagController extends AdminApiController
{
    /**
     * List tags.
     */
    #[Endpoint('List announcement tags', 'Returns every tag with its announcement count.')]
    #[QueryParam('sort', 'string', 'Sort by id, name, created_at, or updated_at. Prefix with a hyphen for descending.', required: false, example: '-updated_at')]
    public function index(GetAnnouncementTagsRequest $request): ApiResourceCollection
    {
        $tags = QueryBuilder::for(AnnouncementTag::query())
            ->withCount('announcements')
            ->allowedSorts(['id', 'name', 'created_at', 'updated_at'])
            ->defaultSort('name')
            ->get();

        return AnnouncementTagResource::collection($tags);
    }

    /**
     * Show tag.
     */
    #[Endpoint('Get announcement tag', 'Returns a single tag.')]
    public function show(GetAnnouncementTagRequest $request, AnnouncementTag $announcement_tag): AnnouncementTagResource
    {
        return AnnouncementTagResource::make($announcement_tag);
    }

    /**
     * Create tag.
     */
    #[BodyParam('name', 'string', required: true, example: 'Maintenance')]
    #[BodyParam('color', 'string', required: true, example: '#38bdf8')]
    #[BodyParam('icon', 'string', required: false, example: 'wrench')]
    #[Endpoint('Create announcement tag', 'Creates a reusable label. Names are unique.')]
    public function store(StoreAnnouncementTagRequest $request): JsonResponse
    {
        $tag = AnnouncementTag::query()->create($request->validated());

        Activity::event('admin:announcement-tag.create')
            ->subject($tag)
            ->property('name', $tag->name)
            ->log();

        return AnnouncementTagResource::make($tag)
            ->withMeta([
                'resource' => route('api.admin.announcement-tags.view', ['announcement_tag' => $tag->id]),
            ])
            ->respond(Response::HTTP_CREATED);
    }

    /**
     * Update tag.
     */
    #[BodyParam('name', 'string', required: false, example: 'Maintenance')]
    #[BodyParam('color', 'string', required: false, example: '#38bdf8')]
    #[BodyParam('icon', 'string', required: false, example: 'wrench')]
    #[Endpoint('Update announcement tag', 'Patches a tag. Announcements keep pointing at it, so their look follows.')]
    public function update(UpdateAnnouncementTagRequest $request, AnnouncementTag $announcement_tag): AnnouncementTagResource
    {
        $announcement_tag->update($request->validated());

        Activity::event('admin:announcement-tag.update')
            ->subject($announcement_tag)
            ->log();

        return AnnouncementTagResource::make($announcement_tag->refresh());
    }

    /**
     * Delete tag.
     */
    #[Endpoint('Delete announcement tag', 'Removes a tag; branded announcements survive, unbranded.')]
    public function destroy(DeleteAnnouncementTagRequest $request, AnnouncementTag $announcement_tag): Response
    {
        Activity::event('admin:announcement-tag.delete')
            ->subject($announcement_tag)
            ->property('name', $announcement_tag->name)
            ->log();

        $announcement_tag->delete();

        return new Response('', Response::HTTP_NO_CONTENT);
    }
}
