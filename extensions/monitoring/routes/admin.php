<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Monitoring\Http\Controllers\AdminController;

Route::get('/', [AdminController::class, 'index']);
Route::get('/summary', [AdminController::class, 'summary']);
Route::post('/rules', [AdminController::class, 'storeRule']);
Route::put('/rules/{id}', [AdminController::class, 'updateRule'])->whereNumber('id');
Route::delete('/rules/{id}', [AdminController::class, 'destroyRule'])->whereNumber('id');
Route::post('/alerts/{id}/acknowledge', [AdminController::class, 'acknowledge'])->whereNumber('id');
Route::get('/servers/{id}', [AdminController::class, 'server'])->whereNumber('id');
