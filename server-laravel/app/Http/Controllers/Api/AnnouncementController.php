<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/routes/announcements.js — site-wide banners
 * (info / maintenance / warning) with an optional display window.
 * Anyone signed in reads the active ones; admins and the IT department manage.
 */
class AnnouncementController extends Controller
{
    private const TYPES = ['info', 'maintenance', 'warning'];
    private const TITLE_MAX = 160;
    private const BODY_MAX = 4000;

    private static function canManage(array $user): bool
    {
        return ($user['role'] ?? null) === 'admin'
            || strtoupper(trim((string) ($user['department'] ?? ''))) === 'IT';
    }

    /** "YYYY-MM-DDTHH:MM[:SS]" (datetime-local) → MySQL DATETIME, else null. */
    private static function toDateTime(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $s = trim(str_replace('T', ' ', (string) $v));
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
            return null;
        }
        return sprintf('%s-%s-%s %s:%s:%s', $m[1], $m[2], $m[3], $m[4], $m[5], $m[6] ?? '00');
    }

    private static function shape(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'title' => $row->title,
            'body' => $row->body,
            'type' => $row->type,
            'starts_at' => $row->starts_at,
            'ends_at' => $row->ends_at,
            'is_active' => (bool) $row->is_active,
            'created_by' => $row->created_by,
            'created_by_name' => $row->created_by_name,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];
    }

    private static function forbidden()
    {
        return response()->json(['error' => 'Only IT staff can manage announcements'], 403);
    }

    /** Active, in-window announcements; managers may pass ?all=1 to list everything. */
    public function index(Request $request)
    {
        $all = in_array($request->query('all'), ['1', 'true'], true);
        if ($all && self::canManage($request->authUser())) {
            $rows = DB::table('announcements')->orderByDesc('created_at')->get();
        } else {
            $rows = DB::table('announcements')
                ->where('is_active', 1)
                ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', DB::raw('NOW()')))
                ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', DB::raw('NOW()')))
                ->orderByRaw("(type = 'warning') DESC, (type = 'maintenance') DESC, created_at DESC")
                ->get();
        }
        return response()->json($rows->map(fn ($r) => self::shape($r))->values());
    }

    public function store(Request $request)
    {
        $user = $request->authUser();
        if (!self::canManage($user)) {
            return self::forbidden();
        }

        $title = trim((string) $request->input('title', ''));
        if ($title === '') {
            return response()->json(['error' => 'Title is required'], 400);
        }
        if (mb_strlen($title) > self::TITLE_MAX) {
            return response()->json(['error' => 'Title must be ' . self::TITLE_MAX . ' characters or fewer'], 400);
        }
        $body = mb_substr(trim((string) $request->input('body', '')), 0, self::BODY_MAX);
        $type = in_array($request->input('type'), self::TYPES, true) ? $request->input('type') : 'info';

        $id = DB::table('announcements')->insertGetId([
            'title' => $title,
            'body' => $body === '' ? null : $body,
            'type' => $type,
            'starts_at' => self::toDateTime($request->input('starts_at')),
            'ends_at' => self::toDateTime($request->input('ends_at')),
            'is_active' => $request->has('is_active') ? ($request->boolean('is_active') ? 1 : 0) : 1,
            'created_by' => $user['sub'],
            'created_by_name' => $user['name'],
        ]);

        return response()->json(self::shape(DB::table('announcements')->where('id', $id)->first()), 201);
    }

    public function update(Request $request, string $id)
    {
        if (!self::canManage($request->authUser())) {
            return self::forbidden();
        }
        if (!ctype_digit($id) || (int) $id <= 0) {
            return response()->json(['error' => 'invalid id'], 400);
        }

        $fields = [];
        if ($request->has('title')) {
            $title = trim((string) $request->input('title'));
            if ($title === '') {
                return response()->json(['error' => 'Title is required'], 400);
            }
            if (mb_strlen($title) > self::TITLE_MAX) {
                return response()->json(['error' => 'Title must be ' . self::TITLE_MAX . ' characters or fewer'], 400);
            }
            $fields['title'] = $title;
        }
        if ($request->has('body')) {
            $body = mb_substr(trim((string) $request->input('body')), 0, self::BODY_MAX);
            $fields['body'] = $body === '' ? null : $body;
        }
        if ($request->has('type')) {
            if (!in_array($request->input('type'), self::TYPES, true)) {
                return response()->json(['error' => 'invalid type'], 400);
            }
            $fields['type'] = $request->input('type');
        }
        if ($request->has('starts_at')) {
            $fields['starts_at'] = self::toDateTime($request->input('starts_at'));
        }
        if ($request->has('ends_at')) {
            $fields['ends_at'] = self::toDateTime($request->input('ends_at'));
        }
        if ($request->has('is_active')) {
            $fields['is_active'] = $request->boolean('is_active') ? 1 : 0;
        }
        if (!$fields) {
            return response()->json(['error' => 'Nothing to update'], 400);
        }

        // affected-rows is 0 for a no-op update too, so check existence explicitly.
        if (!DB::table('announcements')->where('id', $id)->exists()) {
            return response()->json(['error' => 'Announcement not found'], 404);
        }
        DB::table('announcements')->where('id', $id)->update($fields);

        return response()->json(self::shape(DB::table('announcements')->where('id', $id)->first()));
    }

    public function destroy(Request $request, string $id)
    {
        if (!self::canManage($request->authUser())) {
            return self::forbidden();
        }
        if (!ctype_digit($id) || (int) $id <= 0) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        if (!DB::table('announcements')->where('id', $id)->delete()) {
            return response()->json(['error' => 'Announcement not found'], 404);
        }
        return response()->json(['ok' => true]);
    }
}
