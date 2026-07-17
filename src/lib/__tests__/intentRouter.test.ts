import { describe, expect, it } from 'vitest';
import { routeIntent } from '../router/intentRouter';

describe('intentRouter', () => {
  it('routes fitness screenshot cleanup to the fitness agent', () => {
    const r = routeIntent('Turn these workout screenshots into a clean handoff and ignore goals or remaining.');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('fitness-handoff');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('routes a workout-plan request to the Gravl workflow, not the handoff', () => {
    const r = routeIntent('I need help with a workout plan');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('gravl-review');
  });

  it('routes a Gravl review/optimize request to the Gravl workflow', () => {
    expect(routeIntent('Review the workout Gravl gave me').suggestedWorkflowId).toBe('gravl-review');
    expect(routeIntent('Optimize this workout').suggestedWorkflowId).toBe('gravl-review');
  });

  it('still routes cleaning/logging requests to the Fitness Handoff', () => {
    expect(routeIntent('Clean up today’s workout notes').suggestedWorkflowId).toBe('fitness-handoff');
    expect(routeIntent('Log today’s workout').suggestedWorkflowId).toBe('fitness-handoff');
  });

  it('does not route generic nutrition/recovery "review" requests to Gravl', () => {
    // Fitness domain still, but the specific workflow must not be Gravl.
    expect(routeIntent('Review my meal plan').suggestedWorkflowId).not.toBe('gravl-review');
    expect(routeIntent('Review my macros').suggestedWorkflowId).not.toBe('gravl-review');
  });

  it('routes a workout review to Gravl', () => {
    expect(routeIntent('Review this workout').suggestedWorkflowId).toBe('gravl-review');
  });

  it('routes teachback requests to the work agent', () => {
    const r = routeIntent('Make this into a teachback for my coworkers.');
    expect(r.target).toBe('work_project');
    expect(r.suggestedWorkflowId).toBe('work-teachback');
  });

  it('routes weekly planning to calendar/planning', () => {
    const r = routeIntent('Help me plan the week and surface open loops.');
    expect(r.target).toBe('calendar_planning');
    expect(r.suggestedWorkflowId).toBe('weekly-review');
  });

  it('routes prompt improvement to the prompt vault', () => {
    const r = routeIntent('Improve this prompt for Claude Code.');
    expect(r.target).toBe('prompt_vault');
    expect(r.suggestedWorkflowId).toBe('prompt-improvement');
  });

  it('routes dog/home tasks to life admin', () => {
    const r = routeIntent('Remind me about the dogs vet stuff and weekend chores');
    expect(r.target).toBe('dogs_home_life_admin');
  });

  it('returns unknown for unmatched input', () => {
    const r = routeIntent('zzz qqq xyzzy');
    expect(r.target).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('returns unknown for empty input', () => {
    expect(routeIntent('   ').target).toBe('unknown');
  });

  it('never claims certainty (confidence capped at 0.9)', () => {
    const r = routeIntent('fitness fitness macros protein workout gym recomp');
    expect(r.confidence).toBeLessThanOrEqual(0.9);
  });

  it('explains its reasoning', () => {
    const r = routeIntent('Improve this prompt for Claude Code.');
    expect(r.reasoning).toContain('prompt');
  });

  // DOS-WF-001R-A: keyword scoring is word-boundary anchored, so a keyword
  // buried inside a larger, unrelated word must not score. Previously these
  // routed confidently via substring collisions (post/week/model/work/food).
  describe('word-boundary matching (no substring collisions)', () => {
    it('does not route unrelated words whose substring matches a keyword', () => {
      for (const text of [
        'my homework is done',      // "work"
        'weeknight dinner',         // "week"
        'a modeling gig',           // "model"
        'postpone the meeting',     // "post"
        'the foodie blog',          // "food"
        'workuot notes cleanup',    // "work" (misspelled workout)
        'Start a juice cleanse tomorrow', // "clean"
      ]) {
        expect(routeIntent(text).target, text).toBe('unknown');
      }
    });

    it('week/weekly no longer hijacks a workout review to the calendar', () => {
      const r = routeIntent('Weekly workout review');
      expect(r.target).toBe('fitness');
      expect(r.suggestedWorkflowId).toBe('gravl-review');
    });

    it('routes "weekend groceries" to life admin, not calendar (week substring)', () => {
      expect(routeIntent('This weekend I need groceries').target).toBe('dogs_home_life_admin');
    });

    it('still matches multi-word and hyphenated keywords', () => {
      expect(routeIntent('Help me plan the week and surface open loops.').target).toBe('calendar_planning');
      expect(routeIntent('Package this into a side-income asset.').target).toBe('content_asset');
    });

    it('still matches common plurals of singular keywords', () => {
      expect(routeIntent('Review my workouts').target).toBe('fitness');
      expect(routeIntent('I logged two workouts').target).toBe('fitness');
      // "meals" still recognized — as the (unsupported) nutrition-planning intent.
      const meals = routeIntent('Help me plan my meals');
      expect(meals.classification).toBe('unsupported');
      expect(meals.recognizedDomain).toBe('fitness');
    });
  });

  // DOS-WF-001R Phase 1: honest routing result model. Every route names WHY it
  // landed where it did instead of silently picking a workflow.
  describe('honest classification (Phase 1 acceptance)', () => {
    const supported = (input: string, target: string, wf: string) => {
      const r = routeIntent(input);
      expect(r.classification, input).toBe('supported');
      expect(r.target, input).toBe(target);
      expect(r.suggestedWorkflowId, input).toBe(wf);
    };
    const unsupported = (input: string, domain: string) => {
      const r = routeIntent(input);
      expect(r.classification, input).toBe('unsupported');
      expect(r.recognizedDomain, input).toBe(domain);
      expect(r.suggestedWorkflowId, input).toBeUndefined();
    };

    it('1. Gravl review → Gravl Workout Review', () => supported('Review the workout Gravl gave me', 'fitness', 'gravl-review'));
    it('2. clean workout notes → Fitness Handoff', () => supported('Clean up today’s workout notes', 'fitness', 'fitness-handoff'));
    it('3. log workout → Fitness Handoff', () => supported('Log today’s workout', 'fitness', 'fitness-handoff'));
    it('4. sick/train → recognized fitness readiness, unsupported', () => unsupported('I feel sick and do not know whether to train', 'fitness'));
    it('5. plan meals → recognized nutrition, unsupported', () => unsupported('Help me plan my meals', 'fitness'));
    it('6. organize work project → recognized work planning, unsupported', () => unsupported('Help me organize a work project', 'work_project'));
    it('7. analyze gym progress → recognized fitness progress, unsupported', () => unsupported('Analyze my gym progress', 'fitness'));
    it('8. teach it back → Work Teachback', () => supported('Explain this work procedure so I can teach it back', 'work_project', 'work-teachback'));
    it('9. training presentation for coworkers → work, not fitness', () => supported('Training presentation for coworkers', 'work_project', 'work-teachback'));
    it('10. review priorities → Daily Command daily-brief (UI-ROUTE-LOCAL-10 / EX-10)', () => supported('Review priorities', 'daily_command', 'daily-brief'));
    it('11. training review → Gravl review (DOS EX-11)', () => supported('Training review', 'fitness', 'gravl-review'));
    it('12. weekly workout review → fitness, not calendar', () => supported('Weekly workout review', 'fitness', 'gravl-review'));
    it('13. bare "Workout" → ambiguous fitness, never work', () => {
      const r = routeIntent('Workout');
      expect(r.classification).toBe('ambiguous');
      expect(r.target).toBe('fitness');
    });
    it('14. review meal plan → nutrition, not Gravl', () => {
      const r = routeIntent('Review my meal plan');
      expect(r.suggestedWorkflowId).not.toBe('gravl-review');
      expect(r.classification).toBe('unsupported');
    });
    it('15. is this workout safe → Gravl Workout Review', () => supported('Is this workout safe?', 'fitness', 'gravl-review'));

    it('Gravl by name is never unknown', () => {
      expect(routeIntent('gravl').classification).not.toBe('unknown');
      expect(routeIntent('Optimize my Gravl program').classification).not.toBe('unknown');
      expect(routeIntent('gravl').target).toBe('fitness');
    });

    it('multi-domain requests do not silently lose a domain', () => {
      const r = routeIntent('Log today’s workout and help plan tomorrow’s meals');
      expect(r.classification).toBe('multi_domain');
      expect(r.domains && r.domains.length).toBeGreaterThanOrEqual(2);
    });

    it('a single weak generic word does not silently route', () => {
      for (const w of ['review', 'training', 'priorities']) {
        expect(['ambiguous', 'unknown'], w).toContain(routeIntent(w).classification);
      }
    });
  });

  // DOS targeted correction pass: the five remaining High-severity routing
  // cases plus the regressions corrected in this pass, locked so a future
  // change cannot silently reopen them.
  describe('targeted routing corrections', () => {
    it('EX-11 · Training review → supported Gravl review', () => {
      const r = routeIntent('Training review');
      expect(r.classification).toBe('supported');
      expect(r.suggestedWorkflowId).toBe('gravl-review');
    });
    it('C-work-1 · Log my workout → supported Fitness Handoff (logging ≠ review)', () => {
      const r = routeIntent('Log my workout from this morning');
      expect(r.classification).toBe('supported');
      expect(r.suggestedWorkflowId).toBe('fitness-handoff');
    });
    it('C-clean-2 · juice cleanse → recognized nutrition, unsupported (never dogs/home)', () => {
      const r = routeIntent('Start a juice cleanse tomorrow');
      expect(r.classification).toBe('unsupported');
      expect(r.recognizedDomain).toBe('fitness');
      expect(r.target).toBe('unknown');
    });
    it('C-train-4 · Should I train today? → fitness readiness, unsupported (not daily)', () => {
      const r = routeIntent('Should I train today?');
      expect(r.classification).toBe('unsupported');
      expect(r.recognizedDomain).toBe('fitness');
    });
    it('R-4 · Not feeling well today → honestly unknown (no fitness anchor, no daily route)', () => {
      expect(routeIntent('Not feeling well today').classification).toBe('unknown');
    });

    // UI-ROUTE-LOCAL-10 / EX-10: "Review priorities" is a supported Daily
    // Command route — without broadly claiming "review" or "priorities".
    it('UI-ROUTE-LOCAL-10 / EX-10 · Review priorities → Daily Command daily-brief', () => {
      const r = routeIntent('Review priorities');
      expect(r.classification).toBe('supported');
      expect(r.target).toBe('daily_command');
      expect(r.suggestedWorkflowId).toBe('daily-brief');
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(0.9);
    });
    it('EX-10 guard · bare "priorities"/"review" stay honest, never silently daily-routed', () => {
      for (const w of ['priorities', 'priority', 'review']) {
        expect(['ambiguous', 'unknown'], w).toContain(routeIntent(w).classification);
      }
    });
    it('EX-10 guard · "review" with another domain\'s content never lands on daily-brief', () => {
      expect(routeIntent('Review this workout').suggestedWorkflowId).toBe('gravl-review');
      expect(routeIntent('Review my meal plan').classification).toBe('unsupported');
      expect(routeIntent('Review my workout priorities').target).toBe('fitness');
    });

    it('PC-4 · whitespace-padded "weekly   review" → weekly-review', () => {
      const r = routeIntent('  weekly   review  ');
      expect(r.classification).toBe('supported');
      expect(r.suggestedWorkflowId).toBe('weekly-review');
    });
    it('C-plan-3 · content planner → content-asset-planner', () => {
      const r = routeIntent('I need a content planner for posts');
      expect(r.classification).toBe('supported');
      expect(r.suggestedWorkflowId).toBe('content-asset-planner');
    });
    it('C-gravl-4 · workout feedback → Gravl review', () => {
      const r = routeIntent('Grabl workout feedback');
      expect(r.classification).toBe('supported');
      expect(r.suggestedWorkflowId).toBe('gravl-review');
    });
    it('C-train-1 · build a training plan → Gravl review', () => {
      const r = routeIntent('Build me a training plan');
      expect(r.classification).toBe('supported');
      expect(r.suggestedWorkflowId).toBe('gravl-review');
    });

    // Work precedence preserved: "training" + a teachback context stays Work
    // and never splinters into a spurious multi-domain result.
    it('training + coworkers stays Work Teachback (no fitness collision)', () => {
      for (const i of ['Training presentation for coworkers', 'Training material for coworkers']) {
        const r = routeIntent(i);
        expect(r.classification, i).toBe('supported');
        expect(r.target, i).toBe('work_project');
      }
    });
    it('a long fraud-training-program teachback stays Work, not multi-domain', () => {
      const r = routeIntent(
        'I need to prepare a presentation to teach my coworkers about phishing and scam red flags for our fraud training program next month',
      );
      expect(r.target).toBe('work_project');
      expect(r.suggestedWorkflowId).toBe('work-teachback');
    });

    // Dispositioned regressions — honest classification is the intended result.
    it('bare topic words stay ambiguous, never silently routed', () => {
      for (const i of ['prompt', 'prompts', 'network security work']) {
        expect(['ambiguous', 'unknown'], i).toContain(routeIntent(i).classification);
      }
    });
    it('substring-only artifacts stay unknown (oatmeal≠meal, guidebook≠guide)', () => {
      expect(routeIntent('I had oatmeal for breakfast').target).toBe('unknown');
      expect(routeIntent('guidebook for travelers').target).toBe('unknown');
    });
  });
});
