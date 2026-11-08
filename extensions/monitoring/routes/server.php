<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Monitoring\Http\Controllers\ServerController;

Route::get('/', [ServerController::class, 'index']);
Route::get('/history', [ServerController::class, 'history']);
Route::post('/rules', [ServerController::class, 'storeRule']);
Route::put('/rules/{id}', [ServerController::class, 'updateRule'])->whereNumber('id');
Route::delete('/rules/{id}', [ServerController::class, 'destroyRule'])->whereNumber('id');
Route::post('/alerts/{id}/acknowledge', [ServerController::class, 'acknowledge'])->whereNumber('id');
Route::put('/push', [ServerController::class, 'updatePush']);
