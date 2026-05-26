export type ManualBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; headers: [string, string]; rows: [string, string][] }
  | { kind: "callout"; text: string };

export type ManualSection = {
  id: string;
  title: string;
  blocks: ManualBlock[];
};
