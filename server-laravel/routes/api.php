<?php

use App\Http\Controllers\Api\AssetController;
use App\Http\Controllers\Api\AssetRequestController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\KbController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\NetworkController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PasswordResetRequestController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\SlaController;
use App\Http\Controllers\Api\SpaceController;
use App\Http\Controllers\Api\SpaceDocController;
use App\Http\Controllers\Api\SpaceGoalController;
use App\Http\Controllers\Api\SpaceItemController;
use App\Http\Controllers\Api\SurveyController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Mirrors GET /api/health in server/src/index.js.
Route::get('/health', function () {
    try {
        DB::select('SELECT 1');
        return response()->json(['status' => 'ok', 'db' => 'connected', 'time' => now()->toIso8601String()]);
    } catch (\Throwable $e) {
        return response()->json(['status' => 'degraded', 'db' => 'unreachable', 'error' => $e->getMessage()], 503);
    }
});

Route::get('/search', [SearchController::class, 'index'])->middleware('auth.jwt');

// Ported from server/src/routes/auth.js (phase 1 subset — see AuthController docblock).
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])
        ->middleware(['throttle:login-ip', 'throttle:login-email']);

    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle:forgot-password');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])
        ->middleware('throttle:forgot-password');

    Route::post('/logout', [AuthController::class, 'logout']);

    Route::middleware('auth.jwt')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::get('/me/stats', [AuthController::class, 'stats']);
        Route::patch('/me', [AuthController::class, 'updateMe']);
        Route::post('/change-password', [AuthController::class, 'changePassword'])
            ->middleware('throttle:change-password');

        // Self-service profile picture + e-signature (ported from
        // server/src/routes/auth.js — both throttled like the Node avatarLimiter).
        Route::post('/me/avatar', [AuthController::class, 'avatarStore'])->middleware('throttle:avatar-self');
        Route::delete('/me/avatar', [AuthController::class, 'avatarDestroy']);
        Route::post('/me/signature', [AuthController::class, 'signatureStore'])->middleware('throttle:avatar-self');
        Route::delete('/me/signature', [AuthController::class, 'signatureDestroy']);
    });
});

// Ported from server/src/routes/tickets.js (phase 2 — core ticketing).
// requirePermission('tickets','view'|'create') → 'permission:tickets,view'|'create'.
// Fine-grained authorization (canReadTicket/canManageTicket/canApprove) is
// enforced inside TicketController, same as the Node route handlers.
Route::prefix('tickets')->middleware('auth.jwt')->group(function () {
    Route::get('/', [TicketController::class, 'index'])->middleware('permission:tickets,view');
    Route::post('/', [TicketController::class, 'store'])
        ->middleware(['permission:tickets,create', 'throttle:ticket-write']);

    // Literal path — must stay registered before the '/{id}' routes below so
    // Laravel's router never captures 'bulk' as an {id} wildcard.
    Route::post('/bulk', [TicketController::class, 'bulkUpdate'])
        ->middleware(['permission:tickets,view', 'throttle:ticket-write']);

    Route::get('/{id}', [TicketController::class, 'show'])->middleware('permission:tickets,view');
    Route::patch('/{id}', [TicketController::class, 'update'])->middleware('permission:tickets,view');

    Route::post('/{id}/claim', [TicketController::class, 'claim'])->middleware('permission:tickets,view');
    Route::post('/{id}/release', [TicketController::class, 'release'])->middleware('permission:tickets,view');
    Route::post('/{id}/approve', [TicketController::class, 'approve'])->middleware('permission:tickets,view');
    Route::post('/{id}/deny', [TicketController::class, 'deny'])->middleware('permission:tickets,view');

    Route::get('/{id}/activity', [TicketController::class, 'activityIndex'])->middleware('permission:tickets,view');
    Route::post('/{id}/activity', [TicketController::class, 'activityStore'])
        ->middleware(['permission:tickets,create', 'throttle:ticket-write']);

    Route::delete('/{id}/attachments/{attachmentId}', [TicketController::class, 'attachmentDestroy'])
        ->middleware('permission:tickets,view');

    Route::get('/{id}/kb', [TicketController::class, 'kbIndex'])->middleware('permission:tickets,view');
    Route::post('/{id}/kb', [TicketController::class, 'kbStore'])->middleware('permission:tickets,view');
    Route::delete('/{id}/kb/{articleId}', [TicketController::class, 'kbDestroy'])->middleware('permission:tickets,view');

    Route::get('/{id}/watchers', [TicketController::class, 'watchersIndex'])->middleware('permission:tickets,view');
    Route::post('/{id}/watchers', [TicketController::class, 'watchersStore'])->middleware('permission:tickets,view');
    Route::delete('/{id}/watchers/{userId}', [TicketController::class, 'watchersDestroy'])->middleware('permission:tickets,view');
});

// Ported from server/src/routes/sla.js (phase 3). requirePermission('users','manage').
Route::prefix('sla')->middleware(['auth.jwt', 'permission:users,manage'])->group(function () {
    Route::get('/meta', [SlaController::class, 'meta']);

    Route::get('/policies', [SlaController::class, 'policiesIndex']);
    Route::post('/policies', [SlaController::class, 'policiesStore']);
    Route::patch('/policies/{id}', [SlaController::class, 'policiesUpdate']);
    Route::delete('/policies/{id}', [SlaController::class, 'policiesDestroy']);

    Route::get('/calendars', [SlaController::class, 'calendarsIndex']);
    Route::post('/calendars', [SlaController::class, 'calendarsStore']);
    Route::patch('/calendars/{id}', [SlaController::class, 'calendarsUpdate']);
    Route::delete('/calendars/{id}', [SlaController::class, 'calendarsDestroy']);
    Route::post('/calendars/{id}/holidays', [SlaController::class, 'holidaysStore']);
    Route::delete('/calendars/{id}/holidays/{holidayId}', [SlaController::class, 'holidaysDestroy']);
});

// Ported from server/src/routes/automation.js (phase 3). requirePermission('automation','manage').
Route::prefix('automation')->middleware(['auth.jwt', 'permission:automation,manage'])->group(function () {
    Route::get('/meta', [AutomationController::class, 'meta']);
    Route::get('/runs', [AutomationController::class, 'runs']);

    Route::get('/', [AutomationController::class, 'index']);
    Route::post('/', [AutomationController::class, 'store']);
    Route::patch('/{id}', [AutomationController::class, 'update']);
    Route::delete('/{id}', [AutomationController::class, 'destroy']);
});

// Ported from server/src/routes/departments.js (phase 4). List is open to any
// signed-in user; writes require users.manage.
Route::prefix('departments')->middleware('auth.jwt')->group(function () {
    Route::get('/', [DepartmentController::class, 'index']);
    Route::middleware('permission:users,manage')->group(function () {
        Route::post('/', [DepartmentController::class, 'store']);
        Route::patch('/{id}', [DepartmentController::class, 'update']);
        Route::delete('/{id}', [DepartmentController::class, 'destroy']);
    });
});

// Ported from server/src/routes/users.js (phase 4). /assignable + /directory
// are open to any signed-in user; everything else requires users.manage.
Route::prefix('users')->middleware('auth.jwt')->group(function () {
    Route::get('/assignable', [UserController::class, 'assignable']);
    Route::get('/directory', [UserController::class, 'directory']);

    Route::middleware('permission:users,manage')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::post('/', [UserController::class, 'store']);
        Route::post('/import', [UserController::class, 'import'])->middleware('throttle:user-import');
        Route::patch('/{id}', [UserController::class, 'update']);
        Route::post('/{id}/avatar', [UserController::class, 'avatarStore'])->middleware('throttle:avatar-admin');
        Route::delete('/{id}/avatar', [UserController::class, 'avatarDestroy']);
        Route::post('/{id}/reset-password', [UserController::class, 'resetPassword']);
    });
});

// Ported from server/src/routes/assets.js (phase 4).
Route::prefix('assets')->middleware(['auth.jwt', 'permission:assets,view'])->group(function () {
    Route::get('/', [AssetController::class, 'index']);
    Route::get('/meta/types', [AssetController::class, 'metaTypes']);
    Route::get('/{id}', [AssetController::class, 'show']);

    Route::middleware('permission:assets,manage')->group(function () {
        Route::post('/', [AssetController::class, 'store']);
        Route::patch('/{id}', [AssetController::class, 'update']);
        Route::delete('/{id}', [AssetController::class, 'destroy']);
    });
});

// Ported from server/src/routes/asset-requests.js (phase 4). List/create: any
// signed-in user. Update is gated inline in the controller (IT reviewers
// only — not a plain role check, see AssetRequestController::isAssetReviewer).
Route::prefix('asset-requests')->middleware('auth.jwt')->group(function () {
    Route::get('/', [AssetRequestController::class, 'index']);
    Route::post('/', [AssetRequestController::class, 'store']);
    Route::get('/{id}', [AssetRequestController::class, 'show']);
    Route::patch('/{id}', [AssetRequestController::class, 'update']);
    Route::post('/{id}/notes', [AssetRequestController::class, 'storeNote']);
    Route::delete('/{id}', [AssetRequestController::class, 'destroy'])->middleware('role:admin');
});

// Ported from server/src/routes/messages.js (phase 4) — internal mail (Mailbox).
Route::prefix('messages')->middleware('auth.jwt')->group(function () {
    Route::get('/', [MessageController::class, 'index']);
    Route::get('/unread-count', [MessageController::class, 'unreadCount']);
    Route::post('/', [MessageController::class, 'store'])->middleware('throttle:message-send');
    Route::post('/read-all', [MessageController::class, 'readAll']);
    Route::post('/{id}/read', [MessageController::class, 'markRead']);
    Route::delete('/{id}', [MessageController::class, 'destroy']);
});

// Ported from server/src/routes/surveys.js (phase 4) — post-resolution technician survey.
Route::prefix('surveys')->middleware('auth.jwt')->group(function () {
    Route::get('/', [SurveyController::class, 'index'])->middleware('permission:users,manage');
    Route::get('/{ticketId}', [SurveyController::class, 'show']);
    Route::post('/{ticketId}', [SurveyController::class, 'store']);
});

// Ported from server/src/routes/notifications.js (phase 4). Chat activity
// dropped along with the realtime/chat layer — see NotificationController docblock.
Route::prefix('notifications')->middleware('auth.jwt')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::post('/seen', [NotificationController::class, 'seen']);
});

// Ported from server/src/routes/audit.js (phase 4) — admin-only, read-only.
Route::prefix('audit')->middleware(['auth.jwt', 'role:admin'])->group(function () {
    Route::get('/meta', [AuditController::class, 'meta']);
    Route::get('/', [AuditController::class, 'index']);
});

// Ported from server/src/routes/password-resets.js (phase 4). requirePermission('users','manage').
Route::prefix('password-resets')->middleware(['auth.jwt', 'permission:users,manage'])->group(function () {
    Route::get('/', [PasswordResetRequestController::class, 'index']);
    Route::patch('/{id}', [PasswordResetRequestController::class, 'update']);
    Route::delete('/{id}', [PasswordResetRequestController::class, 'destroy']);
});

// Ported from server/src/routes/kb.js (phase 4) — the Knowledge Base. Literal
// paths (meta/categories, suggest, feedback/report, upload) are registered
// before /{slug} so they aren't shadowed by the slug param.
Route::prefix('kb')->middleware(['auth.jwt', 'permission:kb,view'])->group(function () {
    Route::get('/', [KbController::class, 'index']);
    Route::get('/meta/categories', [KbController::class, 'metaCategories']);
    Route::get('/suggest', [KbController::class, 'suggest']);
    Route::get('/feedback/report', [KbController::class, 'feedbackReport'])->middleware('permission:kb,manage');
    Route::post('/upload', [KbController::class, 'upload'])->middleware('permission:kb,manage');

    Route::get('/{slug}', [KbController::class, 'show']);
    Route::get('/{slug}/tickets', [KbController::class, 'tickets']);
    Route::post('/{slug}/feedback', [KbController::class, 'feedbackStore']);

    Route::middleware('permission:kb,manage')->group(function () {
        Route::get('/{slug}/versions', [KbController::class, 'versionsIndex']);
        Route::get('/{slug}/versions/{version}', [KbController::class, 'versionShow']);
        Route::post('/{slug}/versions/{version}/restore', [KbController::class, 'versionRestore']);
    });

    Route::post('/', [KbController::class, 'store'])->middleware('permission:kb,manage');
    Route::patch('/{slug}', [KbController::class, 'update'])->middleware('permission:kb,manage');
    Route::delete('/{slug}', [KbController::class, 'destroy'])->middleware('permission:kb,manage');
});

// Ported from server/src/routes/network.js (phase 4) — UniFi monitoring dashboard.
Route::prefix('network')->middleware('auth.jwt')->group(function () {
    Route::get('/dashboard', [NetworkController::class, 'dashboard'])->middleware('permission:network,view');
    Route::post('/extract-chart', [NetworkController::class, 'extractChart'])->middleware('permission:network,manage');
});

// Ported from server/src/routes/spaces.js (phase 4) — Jira-style project
// Spaces. requirePermission('spaces','view') gates the whole module (matches
// Node's router.use); per-space authorization (membership, owner/PM role,
// spaces.manage oversight) is then checked per request inside the
// controllers via App\Services\SpaceAccess + SpacesHelpers, same split as
// the Node original. /items/mine is registered before /{id} so 'items'
// isn't read as a space id.
Route::prefix('spaces')->middleware(['auth.jwt', 'permission:spaces,view'])->group(function () {
    Route::get('/', [SpaceController::class, 'index']);
    Route::post('/', [SpaceController::class, 'store']);
    Route::get('/items/mine', [SpaceController::class, 'itemsMine']);

    Route::get('/{id}', [SpaceController::class, 'show']);
    Route::patch('/{id}', [SpaceController::class, 'update']);
    Route::delete('/{id}', [SpaceController::class, 'destroy']);
    Route::post('/{id}/icon', [SpaceController::class, 'iconStore']);
    Route::delete('/{id}/icon', [SpaceController::class, 'iconDestroy']);

    Route::post('/{id}/members', [SpaceController::class, 'membersStore']);
    Route::delete('/{id}/members/{userId}', [SpaceController::class, 'membersDestroy']);
    Route::patch('/{id}/members/{userId}', [SpaceController::class, 'membersUpdate']);

    Route::post('/{id}/join', [SpaceController::class, 'join']);
    Route::get('/{id}/join-requests', [SpaceController::class, 'joinRequestsIndex']);
    Route::post('/{id}/join-requests/{reqId}/approve', [SpaceController::class, 'joinRequestsApprove']);
    Route::post('/{id}/join-requests/{reqId}/deny', [SpaceController::class, 'joinRequestsDeny']);

    Route::get('/{id}/items', [SpaceItemController::class, 'index']);
    Route::post('/{id}/items', [SpaceItemController::class, 'store']);
    Route::get('/{id}/items/{itemId}', [SpaceItemController::class, 'show']);
    Route::patch('/{id}/items/{itemId}', [SpaceItemController::class, 'update']);
    Route::delete('/{id}/items/{itemId}', [SpaceItemController::class, 'destroy']);

    Route::post('/{id}/items/{itemId}/comments', [SpaceItemController::class, 'commentsStore']);
    Route::delete('/{id}/items/{itemId}/comments/{commentId}', [SpaceItemController::class, 'commentsDestroy']);
    Route::post('/{id}/items/{itemId}/links', [SpaceItemController::class, 'linksStore']);
    Route::delete('/{id}/items/{itemId}/links/{linkedItemId}', [SpaceItemController::class, 'linksDestroy']);

    Route::get('/{id}/docs', [SpaceDocController::class, 'index']);
    Route::post('/{id}/docs', [SpaceDocController::class, 'store']);
    Route::get('/{id}/docs/{docId}', [SpaceDocController::class, 'show']);
    Route::patch('/{id}/docs/{docId}', [SpaceDocController::class, 'update']);
    Route::delete('/{id}/docs/{docId}', [SpaceDocController::class, 'destroy']);

    Route::get('/{id}/goals', [SpaceGoalController::class, 'index']);
    Route::post('/{id}/goals', [SpaceGoalController::class, 'store']);
    Route::patch('/{id}/goals/{goalId}', [SpaceGoalController::class, 'update']);
    Route::delete('/{id}/goals/{goalId}', [SpaceGoalController::class, 'destroy']);
});
