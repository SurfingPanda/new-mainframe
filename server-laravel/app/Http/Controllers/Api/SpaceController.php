<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AvatarUpload;
use App\Services\InvalidImageException;
use App\Services\SpaceAccess;
use App\Services\SpaceNotify;
use App\Services\SpacesHelpers as H;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Ported from server/src/routes/spaces.js — space CRUD, icon, membership,
 * join-request workflow, and the cross-space "my items" list. Work items,
 * comments, links, docs, and goals live in their own controllers (see
 * routes/api.php's spaces group).
 */
class SpaceController extends Controller
{
    private function respondSpaceNotFound()
    {
        return response()->json(['error' => 'Space not found'], 404);
    }

    public function index(Request $request)
    {
        $meId = $request->authUser()['sub'];
        $rows = DB::table('spaces as s')
            ->selectRaw('s.*,
                (SELECT COUNT(*) FROM space_members m WHERE m.space_id = s.id) AS member_count,
                (SELECT COUNT(*) FROM space_items i WHERE i.space_id = s.id) AS item_count,
                (SELECT role FROM space_members m WHERE m.space_id = s.id AND m.user_id = ?) AS my_role,
                (SELECT status FROM space_join_requests r WHERE r.space_id = s.id AND r.user_id = ?) AS my_request_status
            ', [$meId, $meId])
            ->where('s.is_archived', 0)
            ->orderByDesc('s.updated_at')->limit(500)->get();
        return response()->json($rows->map(fn ($r) => H::shapeSpace($r))->all());
    }

    public function store(Request $request)
    {
        $name = trim((string) $request->input('name', ''));
        if (!$name) {
            return response()->json(['error' => 'Name is required'], 400);
        }
        if (mb_strlen($name) > H::NAME_MAX) {
            return response()->json(['error' => 'Name must be ' . H::NAME_MAX . ' characters or fewer'], 400);
        }
        $description = mb_substr(trim((string) $request->input('description', '')), 0, H::DESC_MAX) ?: null;

        $user = $request->authUser();
        $spaceId = DB::transaction(function () use ($name, $description, $user) {
            $spaceKey = SpaceAccess::generateSpaceKey($name);
            $id = DB::table('spaces')->insertGetId([
                'space_key' => $spaceKey, 'name' => $name, 'description' => $description,
                'owner_id' => $user['sub'], 'owner_name' => $user['name'],
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('space_members')->insert(['space_id' => $id, 'user_id' => $user['sub'], 'role' => 'owner', 'added_at' => now()]);
            return $id;
        });

        $space = DB::table('spaces')->where('id', $spaceId)->first();
        $shaped = (array) $space;
        $shaped['member_count'] = 1;
        $shaped['item_count'] = 0;
        return response()->json(H::shapeSpace($shaped), 201);
    }

    public function itemsMine(Request $request)
    {
        $user = $request->authUser();
        $meId = $user['sub'];
        $manage = H::canManageAll($user);

        $query = DB::table('space_items as i')
            ->join('spaces as s', 's.id', '=', 'i.space_id')
            ->select('i.*', 's.space_key', 's.name as space_name')
            ->where('i.assignee_id', $meId)
            ->where('i.status', '<>', 'done')
            ->whereNotNull('i.due_at');
        if (!$manage) {
            $query->whereExists(fn ($q) => $q->select(DB::raw(1))->from('space_members as m')
                ->whereColumn('m.space_id', 'i.space_id')->where('m.user_id', $meId));
        }
        $rows = $query->orderBy('i.due_at')->orderBy('i.id')->limit(100)->get();

        return response()->json($rows->map(function ($r) {
            $shaped = H::shapeItem($r);
            $shaped['space_key'] = $r->space_key;
            $shaped['space_name'] = $r->space_name;
            return $shaped;
        })->all());
    }

    public function show(Request $request, string $id)
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

        $members = DB::table('space_members as m')
            ->join('users as u', 'u.id', '=', 'm.user_id')
            ->select('m.user_id', 'm.role', 'm.added_at', 'u.name', 'u.email', 'u.avatar_url', 'u.role as user_role', 'u.department')
            ->where('m.space_id', $id)
            ->orderByRaw("(m.role = 'owner') DESC")->orderBy('u.name')
            ->get();

        $admin = H::canAdminister($access, $user);
        $pendingJoinRequests = 0;
        if ($admin) {
            $pendingJoinRequests = DB::table('space_join_requests')->where('space_id', $id)->where('status', 'pending')->count();
        }

        $out = H::shapeSpace($access['space']);
        $out['my_role'] = $access['membership']['role'] ?? null;
        $out['can_administer'] = $admin;
        $out['pending_join_requests'] = $pendingJoinRequests;
        $out['members'] = $members->map(fn ($m) => H::shapeMember($m))->all();
        return response()->json($out);
    }

    public function update(Request $request, string $id)
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
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can edit this space'], 403);
        }

        $updates = [];
        if ($request->has('name')) {
            $name = trim((string) $request->input('name'));
            if (!$name) {
                return response()->json(['error' => 'Name is required'], 400);
            }
            if (mb_strlen($name) > H::NAME_MAX) {
                return response()->json(['error' => 'Name must be ' . H::NAME_MAX . ' characters or fewer'], 400);
            }
            $updates['name'] = $name;
        }
        if ($request->has('description')) {
            $updates['description'] = mb_substr(trim((string) $request->input('description', '')), 0, H::DESC_MAX) ?: null;
        }
        if ($request->has('is_archived')) {
            $updates['is_archived'] = $request->boolean('is_archived') ? 1 : 0;
        }
        if (!$updates) {
            return response()->json(['error' => 'Nothing to update'], 400);
        }

        $updates['updated_at'] = now();
        DB::table('spaces')->where('id', $id)->update($updates);
        return response()->json(H::shapeSpace(DB::table('spaces')->where('id', $id)->first()));
    }

    public function destroy(Request $request, string $id)
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
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can delete this space'], 403);
        }

        DB::table('spaces')->where('id', $id)->delete();
        AvatarUpload::remove($access['space']['icon_url'] ?? null);
        return response()->json(['ok' => true]);
    }

    public function iconStore(Request $request, string $id)
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
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can edit this space'], 403);
        }
        $file = $request->file('icon');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'An image is required'], 400);
        }
        if (!in_array($file->getClientMimeType(), AvatarUpload::ALLOWED_MIME, true)) {
            return response()->json(['error' => 'Icon must be a PNG, JPEG, GIF, or WebP image.'], 400);
        }

        try {
            $iconUrl = AvatarUpload::save(file_get_contents($file->getRealPath()));
        } catch (InvalidImageException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
        DB::table('spaces')->where('id', $id)->update(['icon_url' => $iconUrl, 'updated_at' => now()]);
        AvatarUpload::remove($access['space']['icon_url'] ?? null);
        return response()->json(H::shapeSpace(DB::table('spaces')->where('id', $id)->first()));
    }

    public function iconDestroy(Request $request, string $id)
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
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can edit this space'], 403);
        }
        DB::table('spaces')->where('id', $id)->update(['icon_url' => null, 'updated_at' => now()]);
        AvatarUpload::remove($access['space']['icon_url'] ?? null);
        return response()->json(H::shapeSpace(DB::table('spaces')->where('id', $id)->first()));
    }

    // --- Members ------------------------------------------------------

    public function membersStore(Request $request, string $id)
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
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can manage members'], 403);
        }

        $userId = H::intId($request->input('user_id'));
        if (!$userId) {
            return response()->json(['error' => 'A valid user is required'], 400);
        }
        $role = $request->input('role') === 'project_owner' ? 'project_owner' : 'member';

        $u = DB::table('users')->select('id', 'is_active')->where('id', $userId)->first();
        if (!$u || !$u->is_active) {
            return response()->json(['error' => 'User not found or inactive'], 400);
        }

        DB::table('space_members')->updateOrInsert(
            ['space_id' => $id, 'user_id' => $userId],
            ['role' => $role, 'added_at' => now()]
        );

        $member = DB::table('space_members as m')->join('users as u', 'u.id', '=', 'm.user_id')
            ->select('m.user_id', 'm.role', 'm.added_at', 'u.name', 'u.email', 'u.avatar_url', 'u.role as user_role', 'u.department')
            ->where('m.space_id', $id)->where('m.user_id', $userId)->first();
        return response()->json(H::shapeMember($member), 201);
    }

    public function membersDestroy(Request $request, string $id, string $userId)
    {
        $id = H::intId($id);
        $userId = H::intId($userId);
        if (!$id || !$userId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can manage members'], 403);
        }

        $target = DB::table('space_members')->select('role')->where('space_id', $id)->where('user_id', $userId)->first();
        if (!$target) {
            return response()->json(['error' => 'Member not found'], 404);
        }
        if ($target->role === 'owner') {
            $owners = DB::table('space_members')->where('space_id', $id)->where('role', 'owner')->count();
            if ($owners <= 1) {
                return response()->json(['error' => 'A space must keep at least one owner'], 400);
            }
        }

        DB::table('space_members')->where('space_id', $id)->where('user_id', $userId)->delete();
        return response()->json(['ok' => true]);
    }

    public function membersUpdate(Request $request, string $id, string $userId)
    {
        $id = H::intId($id);
        $userId = H::intId($userId);
        if (!$id || !$userId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $role = (string) $request->input('role', '');
        if (!in_array($role, ['project_owner', 'member'], true)) {
            return response()->json(['error' => 'invalid role'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can manage members'], 403);
        }

        $target = DB::table('space_members')->select('role')->where('space_id', $id)->where('user_id', $userId)->first();
        if (!$target) {
            return response()->json(['error' => 'Member not found'], 404);
        }
        if ($target->role === 'owner') {
            return response()->json(['error' => 'The Project Manager role cannot be changed'], 400);
        }

        DB::table('space_members')->where('space_id', $id)->where('user_id', $userId)->update(['role' => $role]);
        return response()->json(['ok' => true]);
    }

    // --- Join requests --------------------------------------------------

    public function join(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $space = DB::table('spaces')->select('id', 'name', 'is_archived')->where('id', $id)->first();
        if (!$space || $space->is_archived) {
            return $this->respondSpaceNotFound();
        }

        $user = $request->authUser();
        $isMember = DB::table('space_members')->where('space_id', $id)->where('user_id', $user['sub'])->exists();
        if ($isMember) {
            return response()->json(['error' => 'You are already a member of this space'], 400);
        }

        $message = mb_substr(trim((string) $request->input('message', '')), 0, 500) ?: null;
        DB::table('space_join_requests')->updateOrInsert(
            ['space_id' => $id, 'user_id' => $user['sub']],
            ['user_name' => $user['name'], 'status' => 'pending', 'message' => $message,
                'reviewed_by' => null, 'reviewed_at' => null, 'updated_at' => now(), 'created_at' => now()]
        );

        SpaceNotify::notifyJoinRequested((array) $space, ['id' => $user['sub'], 'name' => $user['name']]);
        return response()->json(['ok' => true, 'status' => 'pending'], 201);
    }

    public function joinRequestsIndex(Request $request, string $id)
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
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can review join requests'], 403);
        }

        $rows = DB::table('space_join_requests as r')->join('users as u', 'u.id', '=', 'r.user_id')
            ->select('r.id', 'r.user_id', 'r.message', 'r.created_at', 'u.name', 'u.email', 'u.avatar_url', 'u.department')
            ->where('r.space_id', $id)->where('r.status', 'pending')->orderBy('r.created_at')->get();

        return response()->json($rows->map(fn ($r) => [
            'id' => $r->id, 'user_id' => $r->user_id, 'name' => $r->name, 'email' => $r->email,
            'avatar_url' => $r->avatar_url, 'department' => $r->department, 'message' => $r->message, 'created_at' => $r->created_at,
        ])->all());
    }

    private function decideJoinRequest(Request $request, string $id, string $reqId, string $decision)
    {
        $id = H::intId($id);
        $reqId = H::intId($reqId);
        if (!$id || !$reqId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the space owner can review join requests'], 403);
        }

        $jr = DB::table('space_join_requests')->select('user_id')
            ->where('id', $reqId)->where('space_id', $id)->where('status', 'pending')->first();
        if (!$jr) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        if ($decision === 'approved') {
            // A join request only exists for a non-member (see join()), so this is
            // normally a fresh insert; the existence check just makes approval
            // idempotent against a rare race (e.g. decided twice) without
            // clobbering a role the user may have picked up in the meantime.
            $alreadyMember = DB::table('space_members')->where('space_id', $id)->where('user_id', $jr->user_id)->exists();
            if (!$alreadyMember) {
                DB::table('space_members')->insert(['space_id' => $id, 'user_id' => $jr->user_id, 'role' => 'member', 'added_at' => now()]);
            }
        }
        DB::table('space_join_requests')->where('id', $reqId)->update([
            'status' => $decision, 'reviewed_by' => $user['sub'], 'reviewed_at' => now(), 'updated_at' => now(),
        ]);

        SpaceNotify::notifyJoinDecision($access['space'], $jr->user_id, $decision, $user);
        return response()->json(['ok' => true]);
    }

    public function joinRequestsApprove(Request $request, string $id, string $reqId)
    {
        return $this->decideJoinRequest($request, $id, $reqId, 'approved');
    }

    public function joinRequestsDeny(Request $request, string $id, string $reqId)
    {
        return $this->decideJoinRequest($request, $id, $reqId, 'denied');
    }

    /**
     * Scoped, auth-gated serving for Spaces uploads (Documents-tab files and
     * item-comment attachments share one disk/URL prefix) — a narrow port of
     * the 'spaces' branch of lib/upload-access.js.
     */
    public function serveAttachment(Request $request, string $filename)
    {
        $filename = basename($filename);
        $fullPath = "/uploads/spaces/{$filename}";

        $spaceId = DB::table('space_docs')->where('file_path', $fullPath)->value('space_id')
            ?? DB::table('space_item_comments')->where('attachment_url', $fullPath)->value('space_id');
        if (!$spaceId) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $user = $request->authUser();
        $allowed = H::canManageAll($user)
            || DB::table('space_members')->where('space_id', $spaceId)->where('user_id', $user['sub'])->exists();
        if (!$allowed) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $disk = Storage::disk('spaces');
        if (!$disk->exists($filename)) {
            return response()->json(['error' => 'Not found'], 404);
        }
        return response($disk->get($filename), 200, [
            'Content-Type' => $disk->mimeType($filename) ?: 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
