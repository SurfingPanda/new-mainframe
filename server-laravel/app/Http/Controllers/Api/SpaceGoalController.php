<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SpaceAccess;
use App\Services\SpacesHelpers as H;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Ported from server/src/routes/spaces.js — the Goals tab. */
class SpaceGoalController extends Controller
{
    private const STATUSES = ['on_track', 'at_risk', 'off_track', 'done'];
    private const TITLE_MAX = 200;

    private function respondSpaceNotFound()
    {
        return response()->json(['error' => 'Space not found'], 404);
    }

    private function shapeGoal(object $row): array
    {
        return [
            'id' => $row->id, 'space_id' => $row->space_id, 'title' => $row->title,
            'description' => $row->description, 'status' => $row->status, 'progress' => $row->progress,
            'target_date' => H::dateOnly($row->target_date), 'created_by' => $row->created_by,
            'created_at' => $row->created_at, 'updated_at' => $row->updated_at,
        ];
    }

    /** @return array{ok: bool, value?: int} */
    private function parseProgress(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return ['ok' => true, 'value' => 0];
        }
        if (!is_numeric($raw) || (int) $raw != $raw || $raw < 0 || $raw > 100) {
            return ['ok' => false];
        }
        return ['ok' => true, 'value' => (int) $raw];
    }

    public function index(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $access = SpaceAccess::load($id, $request->authUser());
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        $rows = DB::table('space_goals')->where('space_id', $id)->orderByDesc('created_at')->get();
        return response()->json($rows->map(fn ($r) => $this->shapeGoal($r))->all());
    }

    public function store(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can add goals'], 403);
        }

        $title = trim((string) $request->input('title', ''));
        if (!$title) {
            return response()->json(['error' => 'Title is required'], 400);
        }
        if (mb_strlen($title) > self::TITLE_MAX) {
            return response()->json(['error' => 'Title must be 200 characters or fewer'], 400);
        }
        $description = mb_substr(trim((string) $request->input('description', '')), 0, H::DESC_MAX) ?: null;
        $status = in_array($request->input('status'), self::STATUSES, true) ? $request->input('status') : 'on_track';
        $prog = $this->parseProgress($request->input('progress'));
        if (!$prog['ok']) {
            return response()->json(['error' => 'Progress must be 0–100'], 400);
        }
        $target = H::parseDate($request->input('target_date'));
        if (!$target['ok']) {
            return response()->json(['error' => 'Invalid target date'], 400);
        }

        $goalId = DB::table('space_goals')->insertGetId([
            'space_id' => $id, 'title' => $title, 'description' => $description, 'status' => $status,
            'progress' => $prog['value'], 'target_date' => $target['value'], 'created_by' => $user['name'],
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json($this->shapeGoal(DB::table('space_goals')->where('id', $goalId)->first()), 201);
    }

    public function update(Request $request, string $id, string $goalId)
    {
        $id = H::intId($id);
        $goalId = H::intId($goalId);
        if (!$id || !$goalId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can edit goals'], 403);
        }
        $goal = DB::table('space_goals')->select('id')->where('id', $goalId)->where('space_id', $id)->first();
        if (!$goal) {
            return response()->json(['error' => 'Goal not found'], 404);
        }

        $updates = [];
        $b = $request->all();
        if (array_key_exists('title', $b)) {
            $title = trim((string) $b['title']);
            if (!$title) {
                return response()->json(['error' => 'Title is required'], 400);
            }
            $updates['title'] = mb_substr($title, 0, self::TITLE_MAX);
        }
        if (array_key_exists('description', $b)) {
            $updates['description'] = mb_substr(trim((string) ($b['description'] ?? '')), 0, H::DESC_MAX) ?: null;
        }
        if (array_key_exists('status', $b)) {
            if (!in_array($b['status'], self::STATUSES, true)) {
                return response()->json(['error' => 'Invalid status'], 400);
            }
            $updates['status'] = $b['status'];
        }
        if (array_key_exists('progress', $b)) {
            $prog = $this->parseProgress($b['progress']);
            if (!$prog['ok']) {
                return response()->json(['error' => 'Progress must be 0–100'], 400);
            }
            $updates['progress'] = $prog['value'];
        }
        if (array_key_exists('target_date', $b)) {
            $target = H::parseDate($b['target_date']);
            if (!$target['ok']) {
                return response()->json(['error' => 'Invalid target date'], 400);
            }
            $updates['target_date'] = $target['value'];
        }
        if (!$updates) {
            return response()->json(['error' => 'Nothing to update'], 400);
        }

        $updates['updated_at'] = now();
        DB::table('space_goals')->where('id', $goalId)->update($updates);
        return response()->json($this->shapeGoal(DB::table('space_goals')->where('id', $goalId)->first()));
    }

    public function destroy(Request $request, string $id, string $goalId)
    {
        $id = H::intId($id);
        $goalId = H::intId($goalId);
        if (!$id || !$goalId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can delete goals'], 403);
        }
        $affected = DB::table('space_goals')->where('id', $goalId)->where('space_id', $id)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Goal not found'], 404);
        }
        return response()->json(['ok' => true]);
    }
}
