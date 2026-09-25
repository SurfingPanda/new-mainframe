<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SlaConfig;
use Illuminate\Http\Request;

/**
 * Ported from server/src/routes/settings.js — the flat per-priority SLA
 * defaults (days). Scoped policies/calendars live on SlaController.
 */
class SettingsController extends Controller
{
    /** Readable by any signed-in user so the client can display targets. */
    public function slaShow()
    {
        return response()->json(SlaConfig::get());
    }

    /** Every priority must be a whole number of days, 1–365. */
    public function slaUpdate(Request $request)
    {
        $clean = SlaConfig::sanitize($request->json()->all());
        foreach (SlaConfig::PRIORITIES as $p) {
            if (!array_key_exists($p, $clean)) {
                return response()->json(['error' => 'Each priority needs a whole number of days between 1 and 365.'], 400);
            }
        }

        return response()->json(SlaConfig::save($clean, $request->authUser()['sub']));
    }
}
