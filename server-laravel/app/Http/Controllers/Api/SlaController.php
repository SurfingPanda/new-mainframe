<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BusinessHours;
use App\Services\SlaPolicies;
use App\Services\TicketTaxonomy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * SLA engine admin config — ported from server/src/routes/sla.js. Policy
 * CRUD + business-hours calendar CRUD + holidays. Gated by `users.manage`
 * (see routes/api.php), matching the Node route's
 * `requirePermission('users','manage')`.
 */
class SlaController extends Controller
{
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    private const TIME_RE = '/^([01]\d|2[0-3]):[0-5]\d$/';

    private const POLICY_COLUMNS = ['id', 'name', 'priority', 'request_type', 'category', 'department',
        'response_minutes', 'resolution_minutes', 'calendar_id', 'is_active', 'rank', 'created_at', 'updated_at'];

    private const CAL_COLUMNS = ['id', 'name', 'timezone', 'hours', 'is_default', 'created_at', 'updated_at'];

    // --- Meta ---------------------------------------------------------

    public function meta()
    {
        $depts = DB::table('departments')->where('is_active', 1)->orderBy('name')->pluck('name');
        return response()->json([
            'priorities' => ['low', 'normal', 'high', 'urgent'],
            'requestTypes' => TicketTaxonomy::requestTypeKeys(false),
            'categories' => TicketTaxonomy::topCategoryNames(false),
            'departments' => $depts,
        ]);
    }

    // --- Policies -------------------------------------------------------

    public function policiesIndex()
    {
        // Most specific first so the order mirrors evaluation precedence.
        $rows = DB::table('sla_policies')
            ->select(self::POLICY_COLUMNS)
            ->orderByRaw('(priority IS NOT NULL) + (request_type IS NOT NULL) + (category IS NOT NULL) + (department IS NOT NULL) DESC')
            ->orderByDesc('rank')->orderBy('id')
            ->get();
        return response()->json($rows);
    }

    public function policiesStore(Request $request)
    {
        $result = SlaPolicies::sanitize($request->all());
        if (isset($result['error'])) {
            return response()->json(['error' => $result['error']], 400);
        }
        $id = DB::table('sla_policies')->insertGetId(array_merge($result['value'], [
            'created_at' => now(), 'updated_at' => now(),
        ]));
        SlaPolicies::loadPolicies();
        return response()->json(DB::table('sla_policies')->select(self::POLICY_COLUMNS)->where('id', $id)->first(), 201);
    }

    public function policiesUpdate(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $result = SlaPolicies::sanitize($request->all(), true);
        if (isset($result['error'])) {
            return response()->json(['error' => $result['error']], 400);
        }
        if (empty($result['value'])) {
            return response()->json(['error' => 'nothing to update'], 400);
        }
        $affected = DB::table('sla_policies')->where('id', $id)->update(array_merge($result['value'], ['updated_at' => now()]));
        if (!$affected) {
            return response()->json(['error' => 'Policy not found'], 404);
        }
        SlaPolicies::loadPolicies();
        return response()->json(DB::table('sla_policies')->select(self::POLICY_COLUMNS)->where('id', $id)->first());
    }

    public function policiesDestroy(string $id)
    {
        $id = $this->intId($id);
        $affected = $id ? DB::table('sla_policies')->where('id', $id)->delete() : 0;
        if (!$affected) {
            return response()->json(['error' => 'Policy not found'], 404);
        }
        SlaPolicies::loadPolicies();
        return response()->json(['ok' => true]);
    }

    // --- Business-hours calendars ----------------------------------------

    /** @return string|null error message, or null if valid */
    private function sanitizeHours(mixed $raw, ?array &$out): ?string
    {
        $out = [];
        foreach (self::WEEKDAYS as $d) {
            $windows = is_array($raw[$d] ?? null) ? $raw[$d] : [];
            $out[$d] = [];
            foreach ($windows as $w) {
                if (!is_array($w) || count($w) !== 2) {
                    continue;
                }
                [$s, $e] = array_values($w);
                if (!preg_match(self::TIME_RE, (string) $s) || !preg_match(self::TIME_RE, (string) $e) || $s >= $e) {
                    return "Invalid hours for {$d}: " . json_encode($w);
                }
                $out[$d][] = [$s, $e];
            }
        }
        return null;
    }

    private function calendarWithHolidays(int $id): ?array
    {
        $cal = DB::table('sla_calendars')->select(self::CAL_COLUMNS)->where('id', $id)->first();
        if (!$cal) {
            return null;
        }
        $cal = (array) $cal;
        $cal['holidays'] = DB::table('sla_holidays')->select('id', 'holiday_date', 'label')
            ->where('calendar_id', $id)->orderBy('holiday_date')->get();
        return $cal;
    }

    public function calendarsIndex()
    {
        $rows = DB::table('sla_calendars')->select(self::CAL_COLUMNS)->orderBy('name')->get()
            ->map(fn ($r) => (array) $r)->all();
        $holidays = DB::table('sla_holidays')->select('id', 'calendar_id', 'holiday_date', 'label')->orderBy('holiday_date')->get();
        $byCal = [];
        foreach ($holidays as $h) {
            $byCal[$h->calendar_id][] = $h;
        }
        foreach ($rows as &$c) {
            $c['holidays'] = $byCal[$c['id']] ?? [];
        }
        return response()->json($rows);
    }

    public function calendarsStore(Request $request)
    {
        $name = trim((string) $request->input('name', ''));
        if (!$name) {
            return response()->json(['error' => 'name is required'], 400);
        }
        $timezone = mb_substr(trim((string) $request->input('timezone', 'Asia/Manila')), 0, 64);
        $err = $this->sanitizeHours($request->input('hours'), $hours);
        if ($err) {
            return response()->json(['error' => $err], 400);
        }
        $id = DB::table('sla_calendars')->insertGetId([
            'name' => mb_substr($name, 0, 120), 'timezone' => $timezone, 'hours' => json_encode($hours),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        BusinessHours::loadCalendars();
        return response()->json($this->calendarWithHolidays($id), 201);
    }

    public function calendarsUpdate(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $updates = [];
        if ($request->has('name')) {
            $name = trim((string) $request->input('name'));
            if (!$name) {
                return response()->json(['error' => 'name cannot be blank'], 400);
            }
            $updates['name'] = mb_substr($name, 0, 120);
        }
        if ($request->has('timezone')) {
            $updates['timezone'] = mb_substr(trim((string) $request->input('timezone')), 0, 64);
        }
        if ($request->has('hours')) {
            $err = $this->sanitizeHours($request->input('hours'), $hours);
            if ($err) {
                return response()->json(['error' => $err], 400);
            }
            $updates['hours'] = json_encode($hours);
        }
        if (!$updates) {
            return response()->json(['error' => 'nothing to update'], 400);
        }
        $updates['updated_at'] = now();
        $affected = DB::table('sla_calendars')->where('id', $id)->update($updates);
        if (!$affected) {
            return response()->json(['error' => 'Calendar not found'], 404);
        }
        BusinessHours::loadCalendars();
        return response()->json($this->calendarWithHolidays($id));
    }

    public function calendarsDestroy(string $id)
    {
        $id = $this->intId($id);
        $affected = $id ? DB::table('sla_calendars')->where('id', $id)->delete() : 0;
        if (!$affected) {
            return response()->json(['error' => 'Calendar not found'], 404);
        }
        BusinessHours::loadCalendars();
        return response()->json(['ok' => true]);
    }

    public function holidaysStore(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $date = mb_substr((string) $request->input('holiday_date', ''), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return response()->json(['error' => 'holiday_date must be YYYY-MM-DD'], 400);
        }
        $label = $request->input('label') ? mb_substr((string) $request->input('label'), 0, 120) : null;
        DB::table('sla_holidays')->updateOrInsert(
            ['calendar_id' => $id, 'holiday_date' => $date],
            ['label' => $label]
        );
        BusinessHours::loadCalendars();
        return response()->json($this->calendarWithHolidays($id), 201);
    }

    public function holidaysDestroy(string $id, string $holidayId)
    {
        $id = $this->intId($id);
        $holidayId = $this->intId($holidayId);
        $affected = ($id && $holidayId)
            ? DB::table('sla_holidays')->where('id', $holidayId)->where('calendar_id', $id)->delete()
            : 0;
        if (!$affected) {
            return response()->json(['error' => 'Holiday not found'], 404);
        }
        BusinessHours::loadCalendars();
        return response()->json(['ok' => true]);
    }

    private function intId(?string $v): ?int
    {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return null;
        }
        $n = (int) $v;
        return $n > 0 ? $n : null;
    }
}
