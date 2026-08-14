/**
 * An editor can register a navigation guard with the project portal.
 * The save callback returns false when persistence or verification fails, so
 * the portal can keep the editor mounted instead of discarding its state.
 */
export interface EditorNavigationGuard {
  dirty: boolean;
  saveBeforeLeave: () => Promise<boolean>;
}
