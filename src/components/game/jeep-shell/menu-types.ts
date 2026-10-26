/** One row of the title / pause menu. Selectors cycle a value; actions just fire. */
export interface MenuItem {
  id: string;
  label: string;
  /** current value for selectors, shown between chevrons */
  value?: string;
  disabled?: boolean;
  /** small right-aligned hint, e.g. loading progress */
  hint?: string;
  primary?: boolean;
}

/** Menu behaviour shared by the title and pause screens. */
export interface MenuNav {
  items: MenuItem[];
  focusIdx: number;
  setFocusIdx: (i: number) => void;
  /** fire an item; `dir` steps a selector (default forward) */
  activate: (id: string, dir?: 1 | -1) => void;
}
