<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AvatarUpload;
use App\Services\EmailTemplates;
use App\Services\InvalidImageException;
use App\Services\JwtService;
use App\Services\Mailer;
use App\Services\PasswordPolicy;
use App\Services\Permissions;
use App\Services\SignatureUpload;
use App\Services\Sla;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Ported from server/src/routes/auth.js. Covers: login, /me (read +
 * self-service name/job_title edit), preferences, invalidate-sessions,
 * change-password, forgot/reset-password, logout.
 */
class AuthController extends Controller
{
    // Mirrors PREFERENCE_DEFAULTS in server/src/routes/auth.js. The 'chat'
    // section is kept for response-shape parity even though chat itself was
    // dropped from the port — old saved values just ride along untouched.
    private const PREFERENCE_DEFAULTS = [
        'notifications' => [
            'email_assigned' => true,
            'email_status_change' => true,
            'email_new_comment' => true,
            'email_hr_approval' => true,
            'email_sla_alerts' => true,
        ],
        'chat' => [
            'sound_enabled' => true,
            'enter_to_send' => true,
        ],
    ];

    private const ME_COLUMNS = [
        'id', 'email', 'name', 'role', 'department', 'job_title',
        'avatar_url', 'signature_url', 'permissions', 'preferences',
        'last_login_at', 'created_at',
    ];

    public function login(Request $request)
    {
        $email = (string) $request->input('email', '');
        $password = (string) $request->input('password', '');
        if (!$email || !$password) {
            return response()->json(['error' => 'Email and password are required'], 400);
        }

        $user = DB::table('users')
            ->select('id', 'email', 'password_hash', 'name', 'role', 'department', 'job_title',
                'avatar_url', 'signature_url', 'is_active', 'permissions', 'token_version')
            ->where('email', strtolower(trim($email)))
            ->first();

        if (!$user || !$user->is_active || !Hash::check($password, $user->password_hash)) {
            return response()->json(['error' => 'Invalid email or password'], 401);
        }

        DB::table('users')->where('id', $user->id)->update(['last_login_at' => now()]);

        $permissions = Permissions::effective((array) $user);
        $token = JwtService::issue([
            'sub' => $user->id,
            'email' => $user->email,
            'role' => $user->role,
            'name' => $user->name,
            'permissions' => $permissions,
            'tv' => (int) ($user->token_version ?? 0),
        ]);

        return $this->withAuthCookie(response()->json([
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
                'role' => $user->role,
                'department' => $user->department,
                'job_title' => $user->job_title,
                'avatar_url' => $user->avatar_url,
                'signature_url' => $user->signature_url,
                'permissions' => $permissions,
            ],
        ]), $token);
    }

    public function me(Request $request)
    {
        $me = DB::table('users')
            ->select(self::ME_COLUMNS)
            ->where('id', $request->authUser()['sub'])
            ->where('is_active', 1)
            ->first();

        if (!$me) {
            return response()->json(['error' => 'User not found'], 404);
        }

        return response()->json($this->serializeMe($me));
    }

    /** Technician scorecard for the signed-in user. */
    public function stats(Request $request)
    {
        $userId = $request->authUser()['sub'];
        $me = DB::table('users')
            ->select('name', 'email')
            ->where('id', $userId)
            ->where('is_active', 1)
            ->first();

        if (!$me) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $identities = array_values(array_unique(array_filter([$me->name, $me->email])));
        $tickets = DB::table('tickets')
            ->select(
                'id', 'status',
                'sla_response_breached_at', 'sla_resolution_breached_at'
            )
            ->whereIn('assignee', $identities)
            ->get();

        $onHold = $tickets->where('status', 'on_hold')->count();
        $resolved = $tickets->whereIn('status', Sla::RESOLVED_STATUSES)->count();
        // Count only breaches the SLA monitor actually recorded. Recomputing
        // from today's date can retroactively label an old closed work order as
        // breached even though it never breached while active.
        $breached = $tickets->filter(fn ($ticket) =>
            $ticket->sla_response_breached_at !== null
            || $ticket->sla_resolution_breached_at !== null
        )->count();

        $ratingRow = DB::table('ticket_surveys')
            ->where('technician_id', $userId)
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) AS count, AVG((satisfaction + timeliness + professionalism) / 3) AS average')
            ->first();
        $ratingCount = (int) ($ratingRow->count ?? 0);

        return response()->json([
            'onHold' => $onHold,
            'resolved' => $resolved,
            'breached' => $breached,
            'rating' => [
                'average' => $ratingCount ? round((float) $ratingRow->average, 1) : null,
                'count' => $ratingCount,
            ],
        ]);
    }

    public function updateMe(Request $request)
    {
        $name = $request->input('name');
        $jobTitle = $request->input('job_title');
        $hasName = $request->has('name');
        $hasJobTitle = $request->has('job_title');

        if (!$hasName && !$hasJobTitle) {
            return response()->json(['error' => 'nothing to update'], 400);
        }

        $fields = [];
        if ($hasName) {
            if (!is_string($name) || trim($name) === '') {
                return response()->json(['error' => 'name cannot be empty'], 400);
            }
            $fields['name'] = mb_substr(trim($name), 0, 120);
        }
        if ($hasJobTitle) {
            $fields['job_title'] = $jobTitle ? mb_substr(trim((string) $jobTitle), 0, 120) : null;
        }

        $userId = $request->authUser()['sub'];
        DB::table('users')->where('id', $userId)->update($fields);

        $me = DB::table('users')
            ->select(self::ME_COLUMNS)
            ->where('id', $userId)
            ->where('is_active', 1)
            ->first();

        if (!$me) {
            return response()->json(['error' => 'User not found'], 404);
        }

        return response()->json($this->serializeMe($me));
    }

    public function preferences(Request $request)
    {
        $raw = DB::table('users')->where('id', $request->authUser()['sub'])->value('preferences');
        return response()->json($this->mergedPreferences($this->decodePreferences($raw)));
    }

    /** Shallow-merges each known section (notifications, chat) into the saved JSON. */
    public function updatePreferences(Request $request)
    {
        $patch = $request->json()->all();
        if (!is_array($patch) || ($patch !== [] && array_is_list($patch))) {
            return response()->json(['error' => 'Request body must be an object'], 400);
        }

        $userId = $request->authUser()['sub'];
        $current = $this->decodePreferences(DB::table('users')->where('id', $userId)->value('preferences'));
        foreach (array_keys(self::PREFERENCE_DEFAULTS) as $section) {
            if (isset($patch[$section]) && is_array($patch[$section])) {
                $current[$section] = array_merge($current[$section] ?? [], $patch[$section]);
            }
        }
        DB::table('users')->where('id', $userId)->update(['preferences' => json_encode($current)]);

        return response()->json($this->mergedPreferences($current));
    }

    /**
     * "Sign out all other devices": bump token_version (killing every issued
     * token), then re-issue one for THIS device so the caller stays signed in.
     */
    public function invalidateSessions(Request $request)
    {
        $authUser = $request->authUser();
        $userId = $authUser['sub'];
        DB::table('users')->where('id', $userId)->update(['token_version' => DB::raw('token_version + 1')]);
        $tv = DB::table('users')->where('id', $userId)->value('token_version');

        $token = JwtService::issue([
            'sub' => $userId,
            'email' => $authUser['email'],
            'role' => $authUser['role'],
            'name' => $authUser['name'],
            'permissions' => $authUser['permissions'],
            'tv' => (int) $tv,
        ]);

        return $this->withAuthCookie(response()->json(['ok' => true]), $token);
    }

    public function changePassword(Request $request)
    {
        $current = (string) $request->input('current_password', '');
        $new = (string) $request->input('new_password', '');
        if (!$current || !$new) {
            return response()->json(['error' => 'current_password and new_password are required'], 400);
        }

        $policyError = PasswordPolicy::error($new);
        if ($policyError) {
            return response()->json(['error' => $policyError], 400);
        }
        if ($current === $new) {
            return response()->json(['error' => 'new password must be different from current password'], 400);
        }

        $userId = $request->authUser()['sub'];
        $row = DB::table('users')->select('id', 'password_hash')
            ->where('id', $userId)->where('is_active', 1)->first();
        if (!$row) {
            return response()->json(['error' => 'User not found'], 404);
        }
        if (!Hash::check($current, $row->password_hash)) {
            return response()->json(['error' => 'Current password is incorrect'], 401);
        }

        DB::table('users')->where('id', $userId)->update([
            'password_hash' => Hash::make($new),
            'token_version' => DB::raw('token_version + 1'),
        ]);

        $authUser = $request->authUser();
        $tv = DB::table('users')->where('id', $userId)->value('token_version');
        $token = JwtService::issue([
            'sub' => $userId,
            'email' => $authUser['email'],
            'role' => $authUser['role'],
            'name' => $authUser['name'],
            'permissions' => $authUser['permissions'],
            'tv' => (int) $tv,
        ]);

        // Re-set the cookie so THIS device keeps a valid token — the version
        // bump above invalidated the old one everywhere, including here.
        return $this->withAuthCookie(response()->json(['ok' => true]), $token);
    }

    /**
     * Upload / replace own profile picture. Ported from
     * server/src/routes/auth.js's POST /me/avatar. Returns { avatar_url }.
     */
    public function avatarStore(Request $request)
    {
        $file = $request->file('avatar');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'No image was uploaded.'], 400);
        }
        if (!in_array($file->getClientMimeType(), AvatarUpload::ALLOWED_MIME, true)) {
            return response()->json(['error' => 'Profile picture must be a PNG, JPEG, GIF, or WebP image.'], 400);
        }
        if ($file->getSize() > AvatarUpload::MAX_UPLOAD_BYTES) {
            return response()->json(['error' => 'Profile picture is larger than 5 MB.'], 400);
        }

        try {
            $avatarUrl = AvatarUpload::save(file_get_contents($file->getRealPath()));
        } catch (InvalidImageException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $userId = $request->authUser()['sub'];
        $prev = DB::table('users')->where('id', $userId)->value('avatar_url');
        DB::table('users')->where('id', $userId)->update(['avatar_url' => $avatarUrl]);
        AvatarUpload::remove($prev);

        return response()->json(['avatar_url' => $avatarUrl]);
    }

    /**
     * Remove own profile picture. Ported from DELETE /me/avatar.
     */
    public function avatarDestroy(Request $request)
    {
        $userId = $request->authUser()['sub'];
        $prev = DB::table('users')->where('id', $userId)->value('avatar_url');
        DB::table('users')->where('id', $userId)->update(['avatar_url' => null]);
        AvatarUpload::remove($prev);

        return response()->json(['avatar_url' => null]);
    }

    /**
     * Upload / replace own e-signature (a drawn or uploaded image). Ported
     * from POST /me/signature. Returns { signature_url }.
     */
    public function signatureStore(Request $request)
    {
        $file = $request->file('signature');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'No image was uploaded.'], 400);
        }
        if (!in_array($file->getClientMimeType(), SignatureUpload::ALLOWED_MIME, true)) {
            return response()->json(['error' => 'Signature must be a PNG, JPEG, or WebP image.'], 400);
        }
        if ($file->getSize() > SignatureUpload::MAX_UPLOAD_BYTES) {
            return response()->json(['error' => 'Signature image is larger than 5 MB.'], 400);
        }

        try {
            $signatureUrl = SignatureUpload::save(file_get_contents($file->getRealPath()));
        } catch (InvalidImageException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $userId = $request->authUser()['sub'];
        $prev = DB::table('users')->where('id', $userId)->value('signature_url');
        DB::table('users')->where('id', $userId)->update(['signature_url' => $signatureUrl]);
        SignatureUpload::remove($prev);

        return response()->json(['signature_url' => $signatureUrl]);
    }

    /**
     * Remove own e-signature. Ported from DELETE /me/signature.
     */
    public function signatureDestroy(Request $request)
    {
        $userId = $request->authUser()['sub'];
        $prev = DB::table('users')->where('id', $userId)->value('signature_url');
        DB::table('users')->where('id', $userId)->update(['signature_url' => null]);
        SignatureUpload::remove($prev);

        return response()->json(['signature_url' => null]);
    }

    /**
     * Always responds with success so attackers can't enumerate which emails
     * have accounts. If the email matches an active user, logs the request
     * server-side (an IT admin can follow up via the Users page reset-password
     * flow) and emails a single-use, 1-hour self-service reset link.
     */
    public function forgotPassword(Request $request)
    {
        $email = strtolower(trim((string) $request->input('email', '')));
        $ok = fn () => response()->json(['ok' => true]);
        if (!$email || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) {
            return $ok();
        }

        $user = DB::table('users')
            ->select('id', 'email', 'name', 'is_active')
            ->where('email', $email)
            ->first();

        if ($user && $user->is_active) {
            // Coalesce repeats: if this user already has a pending request,
            // just bump it instead of stacking duplicate rows.
            $existing = DB::table('password_reset_requests')
                ->where('user_id', $user->id)->where('status', 'pending')
                ->first();
            if ($existing) {
                DB::table('password_reset_requests')->where('id', $existing->id)
                    ->update(['updated_at' => now()]);
            } else {
                DB::table('password_reset_requests')->insert([
                    'user_id' => $user->id,
                    'email' => $user->email,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // Only the SHA-256 hash is stored; the raw token lives only in the emailed URL.
            $rawToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $rawToken);
            DB::table('password_reset_tokens')->insert([
                'user_id' => $user->id,
                'token_hash' => $tokenHash,
                'expires_at' => now()->addHour(),
                'created_at' => now(),
            ]);
            Mailer::sendSafe([
                'to' => $user->email,
                ...EmailTemplates::passwordResetLink(
                    $user->name,
                    Mailer::appUrl('/reset-password?token=' . $rawToken)
                ),
            ]);
        }

        return $ok();
    }

    /**
     * Self-service reset: consume a token from the emailed link and set a new
     * password. Public + rate-limited. Errors are generic (no enumeration).
     */
    public function resetPassword(Request $request)
    {
        $token = trim((string) $request->input('token', ''));
        $newPassword = $request->input('new_password');
        if (!$token || !$newPassword) {
            return response()->json(['error' => 'token and new_password are required'], 400);
        }

        $policyError = PasswordPolicy::error($newPassword);
        if ($policyError) {
            return response()->json(['error' => $policyError], 400);
        }

        $tokenHash = hash('sha256', $token);
        $row = DB::table('password_reset_tokens')
            ->select('id', 'user_id')
            ->where('token_hash', $tokenHash)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->first();

        if (!$row) {
            return response()->json(['error' => 'This reset link is invalid or has expired. Please request a new one.'], 400);
        }

        // Bump token_version so any sessions opened before the reset are invalidated.
        DB::table('users')->where('id', $row->user_id)->update([
            'password_hash' => Hash::make($newPassword),
            'token_version' => DB::raw('token_version + 1'),
        ]);
        DB::table('password_reset_tokens')->where('id', $row->id)->update(['used_at' => now()]);
        // Close any pending IT-queue request now that the user reset it themselves.
        DB::table('password_reset_requests')
            ->where('user_id', $row->user_id)->where('status', 'pending')
            ->update([
                'status' => 'resolved',
                'resolved_by' => 'self-service',
                'resolved_at' => now(),
            ]);

        return response()->json(['ok' => true]);
    }

    public function logout()
    {
        return $this->withoutAuthCookie(response()->json(['ok' => true]));
    }

    private function serializeMe(object $me): array
    {
        $row = (array) $me;
        $row['permissions'] = Permissions::effective($row);
        return $row;
    }

    private function decodePreferences(mixed $raw): array
    {
        $saved = is_string($raw) ? json_decode($raw, true) : $raw;
        return is_array($saved) ? $saved : [];
    }

    private function mergedPreferences(array $saved): array
    {
        $out = [];
        foreach (self::PREFERENCE_DEFAULTS as $section => $defaults) {
            $out[$section] = array_merge($defaults, is_array($saved[$section] ?? null) ? $saved[$section] : []);
        }
        return $out;
    }

    private function withAuthCookie(HttpResponse $response, string $token): HttpResponse
    {
        $sevenDays = 7 * 24 * 60 * 60;
        $response->headers->setCookie(Cookie::create(
            name: config('hubly.auth_cookie'),
            value: $token,
            expire: time() + $sevenDays,
            path: '/',
            domain: null,
            secure: config('app.env') === 'production',
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        ));
        return $response;
    }

    private function withoutAuthCookie(HttpResponse $response): HttpResponse
    {
        $response->headers->setCookie(Cookie::create(
            name: config('hubly.auth_cookie'),
            value: '',
            expire: time() - 3600,
            path: '/',
            domain: null,
            secure: config('app.env') === 'production',
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        ));
        return $response;
    }
}
