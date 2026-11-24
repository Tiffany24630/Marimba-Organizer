import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPngSignature, PNG_SIGNATURE } from '../src/png.ts';

test('reconoce la firma PNG completa', () => {
  const bytes = new Uint8Array([...PNG_SIGNATURE, 0x00, 0x00]);
  assert.equal(hasPngSignature(bytes), true);
});

test('rechaza bytes truncados o firmas alteradas', () => {
  assert.equal(hasPngSignature(PNG_SIGNATURE.slice(0, 7)), false);
  const altered = new Uint8Array(PNG_SIGNATURE);
  altered[1] = 0x51;
  assert.equal(hasPngSignature(altered), false);
});
