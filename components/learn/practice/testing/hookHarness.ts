import type { Dispatch, ReactElement, SetStateAction } from "react";

/**
 * A small interaction harness for the quiz controllers, for tests only.
 *
 * The web repo has no DOM test environment, so there is nothing to mount a
 * component in. This harness runs the real controller function (for example
 * `PracticeQuiz`) with its own hook implementation and returns the element
 * tree the controller produced. A test finds a button or a child's props in
 * that tree, calls the handler the controller passed, and the harness runs the
 * controller again with the updated state, as React does after an event.
 *
 * What it proves: the controller's handlers, state, persisted payloads and the
 * props it hands to children. What it does not prove: DOM rendering, browser
 * events, React's scheduler or concurrent behaviour. Child components are not
 * expanded; they are checked by their own markup tests. A test file must route
 * `react`'s hooks here with `vi.mock("react", ...)` (see the controller tests).
 */

export type Props = Record<string, unknown>;

/**
 * React elements are plain objects with a `$$typeof` tag. This module cannot
 * import `react` at runtime: the controller tests replace `react`'s hooks with
 * this module's, so importing `react` here would be a circular import.
 */
function isValidElement(value: unknown): value is ReactElement<Props> {
  return (
    typeof value === "object" &&
    value !== null &&
    "$$typeof" in value &&
    "type" in value &&
    "props" in value
  );
}

interface Fiber {
  slots: Map<number, unknown>;
  cursor: number;
  pendingEffects: Array<() => void>;
  dirty: boolean;
}

let active: Fiber | null = null;

function current(): Fiber {
  if (!active) throw new Error("hook called outside a harness render");
  return active;
}

/** Per-component storage: created on first render, reused on later renders. */
function slot<T>(create: () => T): T {
  const fiber = current();
  const index = fiber.cursor++;
  if (!fiber.slots.has(index)) fiber.slots.set(index, create());
  // Safe: this index is only ever filled by the same hook call site, in order.
  return fiber.slots.get(index) as T;
}

function isInitializer<S>(value: S | (() => S)): value is () => S {
  return typeof value === "function";
}

function isUpdater<S>(value: SetStateAction<S>): value is (prev: S) => S {
  return typeof value === "function";
}

export function useState<S>(
  initial: S | (() => S),
): [S, Dispatch<SetStateAction<S>>] {
  const fiber = current();
  const holder = slot(() => ({
    value: isInitializer(initial) ? initial() : initial,
  }));
  const set: Dispatch<SetStateAction<S>> = (next) => {
    holder.value = isUpdater(next) ? next(holder.value) : next;
    fiber.dirty = true;
  };
  return [holder.value, set];
}

export function useRef<T>(initial: T): { current: T } {
  return slot(() => ({ current: initial }));
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

function memoize<T>(factory: () => T, deps: readonly unknown[]): T {
  const memo = slot<{ deps: readonly unknown[]; value: T } | null>(() => null);
  if (memo && sameDeps(memo.deps, deps)) return memo.value;
  const value = factory();
  const fiber = current();
  // Replace the stored memo in place so the next render sees it.
  fiber.slots.set(fiber.cursor - 1, { deps, value });
  return value;
}

export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
  return memoize(factory, deps);
}

export function useCallback<F>(fn: F, deps: readonly unknown[]): F {
  return memoize(() => fn, deps);
}

type Cleanup = (() => void) | void;

export function useEffect(
  effect: () => Cleanup,
  deps?: readonly unknown[],
): void {
  const fiber = current();
  const state = slot<{ deps: readonly unknown[] | null; cleanup: Cleanup }>(
    () => ({ deps: null, cleanup: undefined }),
  );
  if (deps && state.deps && sameDeps(state.deps, deps)) return;
  fiber.pendingEffects.push(() => {
    if (state.cleanup) state.cleanup();
    state.cleanup = effect();
    state.deps = deps ?? null;
  });
}

/** Maximum render passes per event, to stop an effect loop in a test. */
const MAX_PASSES = 20;

/** What a test needs from a running controller, whatever its props type. */
export interface Screen {
  /** What the controller returned on its latest run. */
  readonly tree: unknown;
  /** Run an event handler, then re-render once its state updates are in. */
  act(fn: () => void): void;
  /** Same for an async handler: wait for it, then re-render. */
  actAsync(fn: () => unknown): Promise<void>;
}

export class Harness<P> implements Screen {
  private readonly fiber: Fiber = {
    slots: new Map(),
    cursor: 0,
    pendingEffects: [],
    dirty: false,
  };
  private output: unknown = null;
  /** Number of times the controller function ran. */
  renders = 0;

  constructor(
    private readonly component: (props: P) => unknown,
    private readonly props: P,
  ) {
    this.settle();
  }

  /** What the controller returned on its latest run. */
  get tree(): unknown {
    return this.output;
  }

  private renderOnce(): void {
    this.fiber.cursor = 0;
    this.fiber.pendingEffects = [];
    this.fiber.dirty = false;
    active = this.fiber;
    try {
      this.output = this.component(this.props);
      this.renders += 1;
    } finally {
      active = null;
    }
  }

  /** Render, run effects, and render again while state keeps changing. */
  private settle(): void {
    this.renderOnce();
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const effects = this.fiber.pendingEffects;
      this.fiber.pendingEffects = [];
      effects.forEach((run) => run());
      if (!this.fiber.dirty) return;
      this.renderOnce();
    }
    throw new Error("harness: render did not settle");
  }

  /** Run an event handler, then re-render once its state updates are in. */
  act(fn: () => void): void {
    fn();
    if (this.fiber.dirty) this.settle();
    else this.runEffectsOnly();
  }

  /** Same for an async handler: wait for it, then re-render. */
  async actAsync(fn: () => unknown): Promise<void> {
    await fn();
    if (this.fiber.dirty) this.settle();
    else this.runEffectsOnly();
  }

  private runEffectsOnly(): void {
    const effects = this.fiber.pendingEffects;
    this.fiber.pendingEffects = [];
    effects.forEach((run) => run());
  }
}

/* ---- Reading the element tree -------------------------------------------- */

export function elementsIn(node: unknown): ReactElement<Props>[] {
  const out: ReactElement<Props>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (isValidElement(value)) {
      out.push(value);
      visit(value.props.children);
    }
  };
  visit(node);
  return out;
}

export function textIn(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textIn).join("");
  if (isValidElement(node)) return textIn(node.props.children);
  return "";
}

/** The one element of a component type, or an error if there is not exactly one. */
export function only(node: unknown, type: unknown): ReactElement<Props> {
  const found = elementsIn(node).filter((el) => el.type === type);
  if (found.length !== 1) {
    throw new Error(`expected one element of the type, found ${found.length}`);
  }
  return found[0];
}

export function has(node: unknown, type: unknown): boolean {
  return elementsIn(node).some((el) => el.type === type);
}

export function buttonLabelled(node: unknown, label: string): ReactElement<Props> {
  const found = elementsIn(node).filter(
    (el) => el.type === "button" && textIn(el).trim() === label,
  );
  if (found.length !== 1) {
    throw new Error(`expected one "${label}" button, found ${found.length}`);
  }
  return found[0];
}

export function buttonLabels(node: unknown): string[] {
  return elementsIn(node)
    .filter((el) => el.type === "button")
    .map((el) => textIn(el).trim());
}

/** Call a handler prop (`onClick`, `onChange`, ...) with the given arguments. */
export function call(el: ReactElement<Props>, prop: string, ...args: unknown[]): unknown {
  const handler = el.props[prop];
  if (typeof handler !== "function") {
    throw new Error(`element has no ${prop} handler`);
  }
  return handler(...args);
}

export function disabled(el: ReactElement<Props>): boolean {
  return el.props.disabled === true;
}
