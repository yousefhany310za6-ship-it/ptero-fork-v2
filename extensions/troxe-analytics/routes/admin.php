<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use TroxeAnalytics\Http\Controllers\CustomersController;
use TroxeAnalytics\Http\Controllers\IncidentsController;
use TroxeAnalytics\Http\Controllers\NetworkController;
use TroxeAnalytics\Http\Controllers\NodeController;
use TroxeAnalytics\Http\Controllers\NodesController;
use TroxeAnalytics\Http\Controllers\OverviewController;
use TroxeAnalytics\Http\Controllers\ReportsController;
use TroxeAnalytics\Http\Controllers\ResourcesController;
use TroxeAnalytics\Http\Controllers\SecurityController;
use TroxeAnalytics\Http\Controllers\ServerController;
use TroxeAnalytics\Http\Controllers\ServersController;
use TroxeAnalytics\Http\Controllers\StatusController;

/*
| Final URL: /api/admin/extensions/troxe-analytics/<path>
|
| Every route here is a read, and every one of them is administrator-only by construction:
| `registerAdminApiRoutes` mounts this file behind the panel's root-administrator session check,
| its mandatory two-factor middleware, `admin-api`, the `throttle:api.admin` rate limit and
| `EnsureExtensionIsAvailable`. No permission is registered for server subusers because there is
| no figure here a subuser should be able to ask for — every one is either the whole fleet or
| another customer's.
|
| There is deliberately no `routes/client.php` and no `routes/server.php`: analytics has no
| customer-facing surface, so there is no endpoint whose authorisation depends on remembering to
| check a sidebar link is hidden.
|
| Ids are guarded with `whereNumber`, so an id that is not a number never reaches the database;
| an id that is a number but not a record answers 404 from `findOrFail` in the controller.
*/

Route::get('/overview', OverviewController::class);
Route::get('/servers', ServersController::class);
Route::get('/servers/{id}', ServerController::class)->whereNumber('id');
Route::get('/nodes', NodesController::class);
Route::get('/nodes/{id}', NodeController::class)->whereNumber('id');
Route::get('/resources', ResourcesController::class);
Route::get('/customers', CustomersController::class);
Route::get('/network', NetworkController::class);
Route::get('/security', SecurityController::class);
Route::get('/incidents', IncidentsController::class);
Route::get('/reports', ReportsController::class);
Route::get('/status', StatusController::class);
