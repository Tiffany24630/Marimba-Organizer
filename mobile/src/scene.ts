export type SceneNode = {
  id: string;
  kind: 'marimba' | 'person';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export const INITIAL_SCENE: SceneNode[] = [
  { id: 'marimba-1', kind: 'marimba', label: 'Marimba tenor', x: 70, y: 80, width: 560, height: 250, color: '#183b56' },
  { id: 'ana', kind: 'person', label: 'Ana · Bajo', x: 125, y: 145, width: 92, height: 48, color: '#2d8d35' },
  { id: 'bruno', kind: 'person', label: 'Bruno · Primera', x: 285, y: 145, width: 108, height: 48, color: '#2d8d35' },
  { id: 'carmen', kind: 'person', label: 'Carmen · Segunda', x: 455, y: 145, width: 112, height: 48, color: '#2d8d35' },
];

export const WORLD = { width: 700, height: 400 } as const;

export type Viewport = { width: number; height: number; zoom: number; panX: number; panY: number };
export type Point = { x: number; y: number };

export function cloneScene(): SceneNode[] {
  return INITIAL_SCENE.map((node) => ({ ...node }));
}

export function hitTest(nodes: SceneNode[], x: number, y: number): SceneNode | null {
  return [...nodes].reverse().find((node) =>
    x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height,
  ) ?? null;
}

export function clampNode(node: SceneNode, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD.width - node.width, x)),
    y: Math.max(0, Math.min(WORLD.height - node.height, y)),
  };
}

export function clampZoom(value: number): number {
  return Math.max(0.55, Math.min(2.4, value));
}

export function viewportScale(viewport: Viewport): number {
  return Math.min(viewport.width / WORLD.width, viewport.height / WORLD.height) * clampZoom(viewport.zoom);
}

export function viewportOrigin(viewport: Viewport): Point {
  const scale = viewportScale(viewport);
  return {
    x: (viewport.width - WORLD.width * scale) / 2 + viewport.panX,
    y: (viewport.height - WORLD.height * scale) / 2 + viewport.panY,
  };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  const origin = viewportOrigin(viewport);
  const scale = viewportScale(viewport);
  return { x: origin.x + point.x * scale, y: origin.y + point.y * scale };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  const origin = viewportOrigin(viewport);
  const scale = viewportScale(viewport);
  return { x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale };
}
