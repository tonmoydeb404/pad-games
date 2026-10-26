/** Focus-ring helpers shared by the overlay components. */
export interface MenuFocus {
  ringCls: (i: number) => string;
  setFocusIdx: (i: number) => void;
  activate: (action: string) => void;
}

export interface OverlayButton {
  label: string;
  disabled?: boolean;
  action: string;
}
