<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Monitoring\Http\Controllers\ChannelController;

Route::get('/channels', [ChannelController::class, 'index']);
Route::post('/channels', [ChannelController::class, 'store']);
Route::put('/channels/{id}', [ChannelController::class, 'update'])->whereNumber('id');
Route::delete('/channels/{id}', [ChannelController::class, 'destroy'])->whereNumber('id');
Route::post('/channels/{id}/test', [ChannelController::class, 'test'])->whereNumber('id')->middleware('throttle:6,1');
