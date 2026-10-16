import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampNode, clampZoom, cloneScene, hitTest, screenToWorld, viewportScale, worldToScreen,
} from '../src/scene.ts';

test('hit testing respeta nodos superpuestos y bordes', () => {
  const nodes = cloneScene();
  assert.equal(hitTest(nodes, 70, 80)?.id, 'marimba-1');
  assert.equal(hitTest(nodes, 125, 145)?.id, 'ana');
  assert.equal(hitTest(nodes, 999, 999), null);
});

test('clampNode mantiene la escena dentro del mundo', () => {
  const node = cloneScene()[1];
  assert.deepEqual(clampNode(node, -20, -30), { x: 0, y: 0 });
  assert.deepEqual(clampNode(node, 999, 999), { x: 608, y: 352 });
});

test('zoom se limita y la proyección mundo-pantalla es reversible', () => {
  assert.equal(clampZoom(0), 0.55);
  assert.equal(clampZoom(9), 2.4);
  const viewport = { width: 900, height: 500, zoom: 1.2, panX: 18, panY: -7 };
  assert.equal(viewportScale(viewport), Math.min(900 / 700, 500 / 400) * 1.2);
  const world = { x: 321, y: 177 };
  const screen = worldToScreen(world, viewport);
  const roundTrip = screenToWorld(screen, viewport);
  assert.ok(Math.abs(roundTrip.x - world.x) < 0.000001);
  assert.ok(Math.abs(roundTrip.y - world.y) < 0.000001);
});

test('fixtures y restablecimiento son deterministas', () => {
  const first = cloneScene();
  first[1].x = 999;
  assert.notDeepEqual(first, cloneScene());
  assert.deepEqual(cloneScene(), cloneScene());
});
