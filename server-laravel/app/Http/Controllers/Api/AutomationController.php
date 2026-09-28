<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Automation;
use App\Services\TicketTaxonomy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Work-order automation rules admin — ported from
 * server/src/routes/automation.js. Gated by `automation.manage` (see
 * routes/api.php).
 */
class AutomationController extends Controller
{
    private const TRIGGERS = ['ticket.created', 'ticket.updated', 'ticket.idle', 'sla.response_breached', 'sla.resolution_breached'];

    private const RULE_COLUMNS = ['id', 'name', 'description', 'trigger_event', 'conditions', 'actions',
        'is_active', 'priority', 'stop_on_match', 'idle_minutes', 'created_by', 'created_at', 'updated_at'];

    /** Validate + normalize a create/update payload. Returns [value, error]. */
    private function buildRule(array $body, bool $partial = false): array
    {
        $out = [];

        if (!$partial || array_key_exists('name', $body)) {
            $name = trim((string) ($body['name'] ?? ''));
            if (!$name) {
                return [null, 'name is required'];
            }
            $out['name'] = mb_substr($name, 0, 160);
        }
        if (!$partial || array_key_exists('trigger_event', $body)) {
            if (!in_array($body['trigger_event'] ?? null, self::TRIGGERS, true)) {
                return [null, 'invalid trigger_event'];
            }
            $out['trigger_event'] = $body['trigger_event'];
        }
        if (!$partial || array_key_exists('conditions', $body)) {
            $conditions = Automation::sanitizeConditions($body['conditions'] ?? null);
            if (!$conditions) {
                return [null, 'at least one valid condition is required'];
            }
            $out['conditions'] = json_encode($conditions);
        }
        if (!$partial || array_key_exists('actions', $body)) {
            $actions = Automation::normalizeActions($body['actions'] ?? null);
            if (!$actions) {
                return [null, 'at least one valid action is required'];
            }
            $out['actions'] = json_encode($actions);
        }
        if (array_key_exists('description', $body)) {
            $out['description'] = $body['description'] ? mb_substr(trim((string) $body['description']), 0, 1000) : null;
        }
        if (array_key_exists('is_active', $body)) {
            $out['is_active'] = $body['is_active'] ? 1 : 0;
        }
        if (array_key_exists('stop_on_match', $body)) {
            $out['stop_on_match'] = $body['stop_on_match'] ? 1 : 0;
        }
        if (array_key_exists('priority', $body)) {
            $p = $body['priority'];
            $out['priority'] = (is_numeric($p) && (int) $p == $p) ? (int) $p : 0;
        }
        if (($body['trigger_event'] ?? null) === 'ticket.idle' || array_key_exists('idle_minutes', $body)) {
            $m = $body['idle_minutes'] ?? null;
            $out['idle_minutes'] = (is_numeric($m) && (int) $m == $m && $m > 0) ? (int) $m : null;
        }
        return [$out, null];
    }

    public function meta()
    {
        return response()->json([
            'triggers' => self::TRIGGERS,
            'conditionFields' => Automation::CONDITION_FIELDS,
            'conditionOps' => Automation::CONDITION_OPS,
            'settableFields' => Automation::settableFields(),
            'categories' => TicketTaxonomy::topCategoryNames(false),
        ]);
    }

    public function runs(Request $request)
    {
        $ruleId = $request->query('rule_id');
        $ruleId = (is_numeric($ruleId) && (int) $ruleId > 0) ? (int) $ruleId : null;

        $query = DB::table('automation_runs as r')
            ->leftJoin('automation_rules as ar', 'ar.id', '=', 'r.rule_id')
            ->select('r.id', 'r.rule_id', 'r.ticket_id', 'r.actions_applied', 'r.created_at', 'ar.name as rule_name')
            ->orderByDesc('r.id')->limit(100);
        if ($ruleId) {
            $query->where('r.rule_id', $ruleId);
        }
        return response()->json($query->get());
    }

    public function index()
    {
        $rows = DB::table('automation_rules')->select(self::RULE_COLUMNS)
            ->orderBy('trigger_event')->orderBy('priority')->orderBy('id')->get();
        return response()->json($rows);
    }

    public function store(Request $request)
    {
        [$value, $error] = $this->buildRule($request->all());
        if ($error) {
            return response()->json(['error' => $error], 400);
        }
        $user = $request->authUser();
        $value['created_by'] = $user['name'] ?? $user['email'] ?? null;
        $value['created_at'] = now();
        $value['updated_at'] = now();
        $id = DB::table('automation_rules')->insertGetId($value);
        return response()->json(DB::table('automation_rules')->select(self::RULE_COLUMNS)->where('id', $id)->first(), 201);
    }

    public function update(Request $request, string $id)
    {
        $intId = $this->intId($id);
        if (!$intId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        [$value, $error] = $this->buildRule($request->all(), true);
        if ($error) {
            return response()->json(['error' => $error], 400);
        }
        if (empty($value)) {
            return response()->json(['error' => 'nothing to update'], 400);
        }
        $value['updated_at'] = now();
        $affected = DB::table('automation_rules')->where('id', $intId)->update($value);
        if (!$affected) {
            return response()->json(['error' => 'Rule not found'], 404);
        }
        return response()->json(DB::table('automation_rules')->select(self::RULE_COLUMNS)->where('id', $intId)->first());
    }

    public function destroy(string $id)
    {
        $intId = $this->intId($id);
        $affected = $intId ? DB::table('automation_rules')->where('id', $intId)->delete() : 0;
        if (!$affected) {
            return response()->json(['error' => 'Rule not found'], 404);
        }
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
