// @vitest-environment happy-dom
//
// DOS-WF-002A — drives the REAL Workflow Runner for the planning-context
// workflows (Daily Brief / Weekly Review): inclusion defaults on, toggle-off
// excludes the section, staleness on toggle, zero-note building, and that
// project notes/area never reach the built prompt.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import WorkflowRunner from '../WorkflowRunner';
import { STORAGE_KEY } from '../../lib/storage/localStore';
import { buildDefaultState } from '../../data/defaultState';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const NOTES_MARKER = 'ZZPRIV-project-notes-should-never-leave-device';
const AREA_MARKER = 'ZZPRIV-project-area-marker';

function fakeLocalStorage(seed?: string) {
  const store = new Map<string, string>();
  if (seed) store.set(STORAGE_KEY, seed);
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
}

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
});

async function mount(path: string, seed?: string) {
  Object.defineProperty(globalThis, 'localStorage', { value: fakeLocalStorage(seed), configurable: true });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter initialEntries={[path]}>
          <WorkflowRunner />
        </MemoryRouter>
      </StoreProvider>,
    );
  });
}

function button(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

function checkboxNear(textSubstring: string): HTMLInputElement {
  const label = [...container.querySelectorAll('label.checkrow')].find((l) => l.textContent?.includes(textSubstring));
  if (!label) throw new Error(`checkbox row containing "${textSubstring}" not found`);
  return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

async function toggleCheckbox(el: HTMLInputElement) {
  await act(async () => {
    el.click();
  });
}

function text(): string {
  return container.textContent ?? '';
}

describe('Workflow Runner planning-state inclusion (DOS-WF-002A)', () => {
  it('defaults inclusion on and permits zero-note Build Prompt for Daily Brief', async () => {
    await mount('/workflows?wf=daily-brief');
    const cb = checkboxNear('Include planning state');
    expect(cb.checked).toBe(true);

    expect(button('Build Prompt').disabled).toBe(false);
    await click('Build Prompt');
    expect(text()).toContain('(no additional notes for today)');

    await click('Full Prompt');
    expect(text()).toContain('## Current DavidOS State');
  });

  it('excludes the section and its content when toggled off before building', async () => {
    await mount('/workflows?wf=daily-brief');
    await toggleCheckbox(checkboxNear('Include planning state'));
    await click('Build Prompt');
    await click('Full Prompt');
    expect(text()).not.toContain('## Current DavidOS State');
  });

  it('marks a built prompt stale when inclusion is toggled after building', async () => {
    await mount('/workflows?wf=daily-brief');
    await click('Build Prompt');
    expect(container.querySelector('[data-testid="stale-notice"]')).toBeNull();
    await toggleCheckbox(checkboxNear('Include planning state'));
    expect(container.querySelector('[data-testid="stale-notice"]')).not.toBeNull();
  });

  it('shows a fingerprint and lets David reveal the exact inserted text', async () => {
    await mount('/workflows?wf=daily-brief');
    await click('Build Prompt');
    expect(text()).toMatch(/[0-9a-f]{8} · [\d,]+ chars/);
    expect(text()).not.toContain('Priorities:\n1.');
    await click('Show Inserted Planning State Text');
    expect(text()).toContain('Priorities:');
  });

  it('explains excluded categories in the disclosure', async () => {
    await mount('/workflows?wf=daily-brief');
    expect(button('Build Prompt').disabled).toBe(false);
    await click('Build Prompt');
    expect(text()).toContain('Never included: project notes, project area, Context Vault content, Health Profile');
  });

  it('Copy Request Only stays disabled with "Nothing typed to copy." when notes are empty', async () => {
    await mount('/workflows?wf=daily-brief');
    await click('Build Prompt');
    expect(button('Copy Request Only').disabled).toBe(true);
    expect(text()).toContain('Nothing typed to copy.');
  });

  it('non-planning workflows still require typed input to build', async () => {
    await mount('/workflows?wf=work-teachback');
    expect(container.querySelector('label.checkrow')?.textContent?.includes('Include planning state')).not.toBe(true);
    expect(button('Build Prompt').disabled).toBe(true);
  });

  it('weekly review uses the weekly zero-note placeholder', async () => {
    await mount('/workflows?wf=weekly-review');
    await click('Build Prompt');
    expect(text()).toContain('(no additional notes for this week)');
  });
});

describe('Workflow Runner planning-state privacy boundary (marker-string test)', () => {
  it('never inserts project notes or area, even though the project name and next action are included', async () => {
    const seedState = buildDefaultState();
    const project = {
      id: 'proj-marker',
      name: 'Marker Project',
      status: 'active' as const,
      area: AREA_MARKER,
      nextAction: 'Ship the marker feature',
      notes: NOTES_MARKER,
      relatedPrompts: [],
      relatedWorkflows: [],
      updatedAt: new Date().toISOString(),
    };
    const seeded = JSON.stringify({ ...seedState, projects: [project] });

    await mount('/workflows?wf=daily-brief', seeded);
    await click('Build Prompt');
    await click('Full Prompt');

    expect(text()).toContain('Marker Project');
    expect(text()).toContain('Ship the marker feature');
    expect(text()).not.toContain(NOTES_MARKER);
    expect(text()).not.toContain(AREA_MARKER);

    await click('Show Inserted Planning State Text');
    expect(text()).not.toContain(NOTES_MARKER);
    expect(text()).not.toContain(AREA_MARKER);
  });
});
