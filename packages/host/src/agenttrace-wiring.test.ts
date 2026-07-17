/**
 * Structural wiring test — asserts src/index.ts contains the agenttrace boot block.
 * Copied into NanoClaw fork and run against the composed project.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const INDEX = path.resolve(process.cwd(), 'src/index.ts');

describe('agenttrace wiring', () => {
  it('awaits startAgentTrace via dynamic import in main()', () => {
    if (!fs.existsSync(INDEX)) {
      // When run inside the peer package itself, skip
      return;
    }
    const source = fs.readFileSync(INDEX, 'utf8');
    expect(source).toMatch(/agenttrace-boot\.js/);
    expect(source).toMatch(/startAgentTrace/);

    const sf = ts.createSourceFile(INDEX, source, ts.ScriptTarget.Latest, true);
    let found = false;

    function visit(node: ts.Node): void {
      if (
        ts.isAwaitExpression(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'startAgentTrace'
      ) {
        found = true;
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    expect(found).toBe(true);
  });
});
