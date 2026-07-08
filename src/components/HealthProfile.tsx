import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { seedHealthProfile } from '../data/healthProfileSeed';
import { validateProfile, profileHash, changedFieldPaths } from '../lib/health/profileValidation';
import type { ValidationResult } from '../lib/health/profileValidation';
import type { HealthFitnessProfile } from '../lib/types';
import { uid, nowIso } from '../lib/types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function blankProfile(): HealthFitnessProfile {
  const now = nowIso();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    seedMetadata: {
      isSeededProfile: false,
      sourceNote: 'Created manually in the app.',
      sourcePriority: 'manual',
      needsVerification: false,
      seededAt: now,
    },
  };
}

const numToStr = (n?: number) => (n === undefined ? '' : String(n));
const strToNum = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/,/g, ''));
  return Number.isNaN(n) ? NaN : n;
};
const listToStr = (l?: string[]) => (l ?? []).join('\n');
const strToList = (s: string): string[] | undefined => {
  const items = s.split('\n').map((x) => x.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
};

/**
 * Health & Fitness Profile editor (Phase 9).
 * Manual save only; changes are validated softly; audit logs record changed
 * field names and a profile hash — never the health values themselves.
 */
export default function HealthProfile() {
  const { state, update, audit } = useStore();
  const [draft, setDraft] = useState<HealthFitnessProfile | null>(() => (state.healthProfile ? clone(state.healthProfile) : null));
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [flash, setFlash] = useState('');

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(state.healthProfile),
    [draft, state.healthProfile],
  );

  // Warn on tab close with unsaved changes. (In-app nav shows the sticky banner.)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved Health Profile changes. Leave without saving?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const set = (fn: (d: HealthFitnessProfile) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const next = clone(d);
      fn(next);
      return next;
    });
  };

  function save() {
    if (!draft) return;
    const result = validateProfile(draft);
    setValidation(result);
    if (result.errors.length > 0) {
      setFlash('Fix the blocking issues below, then save again.');
      return;
    }
    const now = nowIso();
    const next: HealthFitnessProfile = {
      ...draft,
      updatedAt: now,
      seedMetadata: draft.seedMetadata
        ? { ...draft.seedMetadata, userModifiedAt: now }
        : undefined,
    };
    const changed = changedFieldPaths(state.healthProfile, next);
    update((s) => ({ ...s, healthProfile: next }));
    setDraft(clone(next));
    const hash = profileHash(next);
    audit({
      command: 'health_profile_updated',
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary:
        `Changed fields: ${changed.length > 0 ? changed.join(', ') : '(none)'} · ` +
        `profile ${hash.slice(0, 8)} · ${JSON.stringify(next).length.toLocaleString('en-US')} chars` +
        (result.warnings.length > 0 ? ` · saved with ${result.warnings.length} warning(s)` : ''),
    });
    setFlash(`Health Profile saved.${result.warnings.length > 0 ? ' (Warnings noted below — save was allowed.)' : ''}`);
  }

  if (!draft) {
    return (
      <div className="card">
        <h2>Health &amp; Fitness Profile</h2>
        <p className="muted small">
          Set up your Health &amp; Fitness Profile to help Health &amp; Fitness workflows compare
          entries against your personal targets, regimen, restrictions, and goals.
        </p>
        <p className="muted small">You can fill out only what you know now. Empty fields will be ignored.</p>
        <p className="muted small">You can skip this for now and add it later.</p>
        <div className="btn-row">
          <button className="primary" onClick={() => setDraft(seedHealthProfile())}>Restore starter profile</button>
          <button onClick={() => setDraft(blankProfile())}>Start blank</button>
        </div>
      </div>
    );
  }

  const meta = draft.seedMetadata;
  const n = draft.nutritionTargets ?? {};
  const g = draft.goals ?? {};
  const a = draft.activityTargets ?? {};
  const r = draft.recoveryTargets ?? {};
  const t = draft.trainingPlan ?? {};
  const b = draft.bodyMetrics ?? {};
  const m = draft.medicalContext ?? {};
  const sm = draft.supplementsMedications ?? {};
  const ap = draft.analysisPreferences ?? {};

  return (
    <>
      {dirty && (
        <div className="card sticky-warn">
          <p className="row small">
            <strong>Unsaved Health Profile changes</strong>
            <span className="btn-row" style={{ margin: 0 }}>
              <button className="chip primary" onClick={save}>Save now</button>
              <button className="chip" onClick={() => { setDraft(state.healthProfile ? clone(state.healthProfile) : null); setValidation(null); setFlash('Changes discarded.'); }}>Discard</button>
            </span>
          </p>
        </div>
      )}

      <div className="card">
        <h2>Health &amp; Fitness Profile</h2>
        <p className="muted small">
          Stored locally. May contain personal health and fitness data. Included in backups; preserved
          during Reset to seed unless you explicitly choose to delete it.
        </p>
        {meta && (
          <details className="item">
            <summary className="small">
              <span>
                {meta.isSeededProfile ? 'Starter profile' : 'Manual profile'} · Source:{' '}
                {meta.sourcePriority === 'claude_gdrive' ? 'Claude/GDrive' : meta.sourcePriority === 'fallback_handoff' ? 'fallback handoff' : 'manual'}
                {meta.needsVerification ? ' · Needs verification' : meta.lastVerifiedAt ? ` · Verified ${meta.lastVerifiedAt}` : ''}
              </span>
            </summary>
            <ul className="plain small">
              <li>Source note: {meta.sourceNote}</li>
              <li>Seeded: {meta.seededAt.slice(0, 10)}</li>
              {meta.lastVerifiedAt && <li>Last verified: {meta.lastVerifiedAt}</li>}
              {meta.userModifiedAt && <li>Last modified by you: {meta.userModifiedAt.slice(0, 10)}</li>}
              <li>Needs verification: {meta.needsVerification ? 'yes' : 'no'}</li>
            </ul>
            {meta.needsVerification && (
              <button
                className="chip"
                onClick={() => set((d) => { d.seedMetadata = { ...d.seedMetadata!, needsVerification: false, lastVerifiedAt: nowIso().slice(0, 10) }; })}
              >
                Mark verified
              </button>
            )}
          </details>
        )}
      </div>

      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="card">
          {validation.errors.map((e) => (
            <p key={e.fieldPath} className="notice risk-block small"><strong>Blocked:</strong> {e.message}</p>
          ))}
          {validation.warnings.map((w) => (
            <p key={w.fieldPath} className="notice small">⚠ {w.message}</p>
          ))}
        </div>
      )}

      <details className="card" open>
        <summary><h3 style={{ display: 'inline' }}>Nutrition Targets</h3></summary>
        <div className="grid-2">
          <label className="field">Calories (kcal)
            <input type="text" inputMode="numeric" value={numToStr(n.calories)} placeholder="e.g. 2000"
              onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, calories: strToNum(e.target.value) }; })} />
          </label>
          <label className="field">Protein (g)
            <input type="text" inputMode="numeric" value={numToStr(n.proteinGrams)} placeholder="e.g. 190"
              onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, proteinGrams: strToNum(e.target.value) }; })} />
          </label>
          <label className="field">Carbs (g)
            <input type="text" inputMode="numeric" value={numToStr(n.carbGrams)} placeholder="flexible remainder"
              onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, carbGrams: strToNum(e.target.value) }; })} />
          </label>
          <label className="field">Fat (g)
            <input type="text" inputMode="numeric" value={numToStr(n.fatGrams)} placeholder="e.g. 75"
              onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, fatGrams: strToNum(e.target.value) }; })} />
          </label>
          <label className="field">Fiber (g)
            <input type="text" inputMode="numeric" value={numToStr(n.fiberGrams)} placeholder="e.g. 30"
              onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, fiberGrams: strToNum(e.target.value) }; })} />
          </label>
          <label className="field">Water (mL)
            <input type="text" inputMode="numeric" value={numToStr(n.waterMl)} placeholder="e.g. 3000"
              onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, waterMl: strToNum(e.target.value) }; })} />
          </label>
        </div>
        <label className="field">Nutrition notes
          <textarea value={n.notes ?? ''} placeholder="Cut context, carb strategy, fiber floor/cap…"
            onChange={(e) => set((d) => { d.nutritionTargets = { ...d.nutritionTargets, notes: e.target.value || undefined }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Activity Targets</h3></summary>
        <label className="field">Steps per day
          <input type="text" inputMode="numeric" value={numToStr(a.stepsPerDay)} placeholder="e.g. 8000"
            onChange={(e) => set((d) => { d.activityTargets = { ...d.activityTargets, stepsPerDay: strToNum(e.target.value) }; })} />
        </label>
        <label className="field">Cardio target
          <input type="text" value={a.cardioTarget ?? ''} placeholder="e.g. Zone 2 walking"
            onChange={(e) => set((d) => { d.activityTargets = { ...d.activityTargets, cardioTarget: e.target.value || undefined }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Recovery Targets</h3></summary>
        <label className="field">Sleep hours
          <input type="text" value={r.sleepHours ?? ''} placeholder="e.g. 7.5+ target"
            onChange={(e) => set((d) => { d.recoveryTargets = { ...d.recoveryTargets, sleepHours: e.target.value || undefined }; })} />
        </label>
        <label className="field">HRV baseline
          <input type="text" value={r.hrvBaseline ?? ''} placeholder="e.g. ~66 ms"
            onChange={(e) => set((d) => { d.recoveryTargets = { ...d.recoveryTargets, hrvBaseline: e.target.value || undefined }; })} />
        </label>
        <label className="field">Resting HR baseline
          <input type="text" value={r.restingHeartRateBaseline ?? ''} placeholder="e.g. ~53 bpm"
            onChange={(e) => set((d) => { d.recoveryTargets = { ...d.recoveryTargets, restingHeartRateBaseline: e.target.value || undefined }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Training Plan</h3></summary>
        <label className="field">Weekly frequency
          <input type="text" value={t.weeklyFrequency ?? ''} placeholder="e.g. 4–5 sessions, min 3"
            onChange={(e) => set((d) => { d.trainingPlan = { ...d.trainingPlan, weeklyFrequency: e.target.value || undefined }; })} />
        </label>
        <label className="field">Split
          <input type="text" value={t.split ?? ''} placeholder="e.g. Upper/lower + push/pull"
            onChange={(e) => set((d) => { d.trainingPlan = { ...d.trainingPlan, split: e.target.value || undefined }; })} />
        </label>
        <label className="field">Preferred style
          <input type="text" value={t.preferredStyle ?? ''} placeholder="e.g. hypertrophy, 12–20 reps, machines/cables"
            onChange={(e) => set((d) => { d.trainingPlan = { ...d.trainingPlan, preferredStyle: e.target.value || undefined }; })} />
        </label>
        <label className="field">Movement restrictions (one per line)
          <textarea value={listToStr(t.movementRestrictions)} placeholder="e.g. No axial loading"
            onChange={(e) => set((d) => { d.trainingPlan = { ...d.trainingPlan, movementRestrictions: strToList(e.target.value) }; })} />
        </label>
        <label className="field">Current training notes
          <textarea value={t.currentTrainingNotes ?? ''}
            onChange={(e) => set((d) => { d.trainingPlan = { ...d.trainingPlan, currentTrainingNotes: e.target.value || undefined }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Body Metrics</h3></summary>
        <label className="field">Height
          <input type="text" value={b.height ?? ''}
            onChange={(e) => set((d) => { d.bodyMetrics = { ...d.bodyMetrics, height: e.target.value || undefined }; })} />
        </label>
        <label className="field">Current weight
          <input type="text" value={b.currentWeight ?? ''}
            onChange={(e) => set((d) => { d.bodyMetrics = { ...d.bodyMetrics, currentWeight: e.target.value || undefined }; })} />
        </label>
        <label className="field">Goal weight
          <input type="text" value={b.goalWeight ?? ''}
            onChange={(e) => set((d) => { d.bodyMetrics = { ...d.bodyMetrics, goalWeight: e.target.value || undefined }; })} />
        </label>
        <label className="field">Waist
          <input type="text" value={b.waist ?? ''}
            onChange={(e) => set((d) => { d.bodyMetrics = { ...d.bodyMetrics, waist: e.target.value || undefined }; })} />
        </label>
        <label className="field">Body fat estimate
          <input type="text" value={b.bodyFatEstimate ?? ''}
            onChange={(e) => set((d) => { d.bodyMetrics = { ...d.bodyMetrics, bodyFatEstimate: e.target.value || undefined }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Goals</h3></summary>
        <label className="field">Primary goal
          <select value={g.primaryGoal ?? ''}
            onChange={(e) => set((d) => { d.goals = { ...d.goals, primaryGoal: (e.target.value || undefined) as never }; })}>
            <option value="">(unset)</option>
            <option value="fat_loss">Fat loss</option>
            <option value="recomposition">Recomposition</option>
            <option value="muscle_gain">Muscle gain</option>
            <option value="maintenance">Maintenance</option>
            <option value="performance">Performance</option>
            <option value="general_health">General health</option>
          </select>
        </label>
        <label className="field">Goal notes
          <textarea value={g.goalNotes ?? ''}
            onChange={(e) => set((d) => { d.goals = { ...d.goals, goalNotes: e.target.value || undefined }; })} />
        </label>
        <label className="field">Visual goal
          <input type="text" value={g.visualGoal ?? ''}
            onChange={(e) => set((d) => { d.goals = { ...d.goals, visualGoal: e.target.value || undefined }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Supplements / Medications</h3></summary>
        <p className="muted small">
          Sensitive — only include what you want inserted into generated prompts. Analysis never
          recommends medication or dosing changes.
        </p>
        <label className="field">Supplements (one per line)
          <textarea value={listToStr(sm.supplements)}
            onChange={(e) => set((d) => { d.supplementsMedications = { ...d.supplementsMedications, supplements: strToList(e.target.value) }; })} />
        </label>
        <label className="field">Medications (one per line)
          <textarea value={listToStr(sm.medications)}
            onChange={(e) => set((d) => { d.supplementsMedications = { ...d.supplementsMedications, medications: strToList(e.target.value) }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Medical / Safety Context</h3></summary>
        <label className="field">Injury history (one per line)
          <textarea value={listToStr(m.injuryHistory)}
            onChange={(e) => set((d) => { d.medicalContext = { ...d.medicalContext, injuryHistory: strToList(e.target.value) }; })} />
        </label>
        <label className="field">Movement restrictions (one per line)
          <textarea value={listToStr(m.movementRestrictions)}
            onChange={(e) => set((d) => { d.medicalContext = { ...d.medicalContext, movementRestrictions: strToList(e.target.value) }; })} />
        </label>
        <label className="field">Device context (one per line)
          <textarea value={listToStr(m.deviceContext)} placeholder="e.g. CPAP nightly, Garmin"
            onChange={(e) => set((d) => { d.medicalContext = { ...d.medicalContext, deviceContext: strToList(e.target.value) }; })} />
        </label>
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Prompt Summary</h3></summary>
        <p className="muted small">
          Used verbatim as the “Additional context” in fitness prompts. If empty, a keyword-prioritized
          excerpt of the freeform context is used instead.
        </p>
        <textarea value={draft.promptSummary ?? ''} rows={6}
          onChange={(e) => set((d) => { d.promptSummary = e.target.value || undefined; })} />
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Freeform Context</h3></summary>
        <textarea value={draft.freeformContext ?? ''} rows={6}
          onChange={(e) => set((d) => { d.freeformContext = e.target.value || undefined; })} />
      </details>

      <details className="card">
        <summary><h3 style={{ display: 'inline' }}>Analysis Preferences</h3></summary>
        <label className="field">Coaching style
          <select value={ap.coachingStyle ?? ''}
            onChange={(e) => set((d) => { d.analysisPreferences = { ...d.analysisPreferences, coachingStyle: (e.target.value || undefined) as never }; })}>
            <option value="">(unset)</option>
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
            <option value="context_sensitive">Context-sensitive</option>
          </select>
        </label>
        <label className="field">Output detail
          <select value={ap.outputDetail ?? ''}
            onChange={(e) => set((d) => { d.analysisPreferences = { ...d.analysisPreferences, outputDetail: (e.target.value || undefined) as never }; })}>
            <option value="">(unset)</option>
            <option value="short">Short</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </label>
      </details>

      <div className="card">
        <h3>Privacy / Data Notes</h3>
        <p className="muted small">
          Stored locally in this browser. Included in exported backups (the export warning mentions it).
          Preserved during Reset to seed unless you explicitly choose to delete it. Audit logs record
          which fields changed and a fingerprint — never the health values themselves.
        </p>
        <div className="btn-row">
          <button className="primary" onClick={save} disabled={!dirty}>Save Health Profile</button>
        </div>
        {flash && <p className="notice flash">{flash}</p>}
      </div>
    </>
  );
}
