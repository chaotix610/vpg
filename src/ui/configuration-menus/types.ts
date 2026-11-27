export type ConfigBoothLayout =
  | "split-right"
  | "framed-center"
  | "framed-moves"
  | "framed-moves-detail"
  | "framed-rail"
  | "fullscreen";

export type ConfigBarVariant =
  | "default"
  | "option"
  | "category"
  | "roster"
  | "clip"
  | "value"
  | "param"
  | "back";

export interface ConfigPickerItem {
  readonly value: number | string;
  readonly label: string;
  readonly colour?: string | null;
}
