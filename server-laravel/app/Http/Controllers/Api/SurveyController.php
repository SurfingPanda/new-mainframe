<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TicketVisibility as TV;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Ported from server/src/routes/surveys.js — post-resolution technician survey. */
class SurveyController extends Controller
{
    private const ASPECTS = ['satisfaction', 'timeliness', 'professionalism'];
    private const COMMENT_MAX = 1000;

    private function shape(object $row): array
    {
        return [
            'ticket_id' => $row->ticket_id, 'technician' => $row->technician,
            'respondent_id' => $row->respondent_id, 'respondent_name' => $row->respondent_name,
            'status' => $row->status, 'satisfaction' => $row->satisfaction,
            'timeliness' => $row->timeliness, 'professionalism' => $row->professionalism,
            'comment' => $row->comment, 'created_at' => $row->created_at, 'completed_at' => $row->completed_at,
            'ticket_title' => $row->ticket_title ?? null,
        ];
    }

    private function loadSurvey(int $ticketId): ?object
    {
        return DB::table('ticket_surveys as s')
            ->leftJoin('tickets as t', 't.id', '=', 's.ticket_id')
            ->select('s.*', 't.title as ticket_title')
            ->where('s.ticket_id', $ticketId)->first();
    }

    public function index()
    {
        $rows = DB::table('ticket_surveys as s')
            ->leftJoin('tickets as t', 't.id', '=', 's.ticket_id')
            ->select('s.ticket_id', 't.title as ticket_title', 's.technician', 's.technician_id',
                's.respondent_name', 's.status', 's.satisfaction', 's.timeliness', 's.professionalism',
                's.comment', 's.created_at', 's.completed_at')
            ->orderByDesc('s.created_at')->limit(1000)->get();
        return response()->json($rows);
    }

    public function show(Request $request, string $ticketId)
    {
        $ticketId = (int) $ticketId;
        if ($ticketId <= 0) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $survey = $this->loadSurvey($ticketId);
        if (!$survey) {
            return response()->json(['error' => 'Survey not found'], 404);
        }
        $user = $request->authUser();
        if ((int) $survey->respondent_id !== $user['sub'] && !TV::isStaff($user)) {
            return response()->json(['error' => 'Survey not found'], 404);
        }
        return response()->json($this->shape($survey));
    }

    public function store(Request $request, string $ticketId)
    {
        $ticketId = (int) $ticketId;
        if ($ticketId <= 0) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $survey = $this->loadSurvey($ticketId);
        if (!$survey) {
            return response()->json(['error' => 'Survey not found'], 404);
        }
        $user = $request->authUser();
        if ((int) $survey->respondent_id !== $user['sub']) {
            return response()->json(['error' => 'This survey is not yours to complete'], 403);
        }
        if ($survey->status === 'completed') {
            return response()->json(['error' => 'This survey has already been submitted'], 409);
        }

        $ratings = [];
        foreach (self::ASPECTS as $aspect) {
            $n = $request->input($aspect);
            if (!is_numeric($n) || (int) $n != $n || $n < 1 || $n > 5) {
                return response()->json(['error' => "{$aspect} must be a rating from 1 to 5"], 400);
            }
            $ratings[$aspect] = (int) $n;
        }
        $comment = mb_substr(trim((string) $request->input('comment', '')), 0, self::COMMENT_MAX) ?: null;

        DB::table('ticket_surveys')->where('ticket_id', $ticketId)->update([
            'satisfaction' => $ratings['satisfaction'], 'timeliness' => $ratings['timeliness'],
            'professionalism' => $ratings['professionalism'], 'comment' => $comment,
            'status' => 'completed', 'completed_at' => now(),
        ]);

        return response()->json($this->shape($this->loadSurvey($ticketId)));
    }
}
