/** Named arena pieces, bundled with the app so the editor also works in production. */
export type PieceKind = "floor" | "barricade" | "outer";

export interface ArenaPieceData {
  id: string;
  displayName: string;
  kind: PieceKind;
  glb: string;
}

const modules = import.meta.glob("../../data/environments/arena-parts/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ArenaPieceData & { $schema?: string }>;

const pieces = Object.values(modules).map(({ $schema: _schema, ...piece }) => piece);
const byId = new Map(pieces.map((piece) => [piece.id, piece]));

export function arenaPieceById(id: string): ArenaPieceData | null {
  return byId.get(id) ?? null;
}

/** Accept old saved GLB paths as well as ids; new drafts always write ids. */
export function resolveArenaPiece(kind: PieceKind, reference: string): ArenaPieceData | null {
  const piece = byId.get(reference) ?? pieces.find((candidate) => candidate.kind === kind && candidate.glb === reference);
  return piece?.kind === kind ? piece : null;
}
