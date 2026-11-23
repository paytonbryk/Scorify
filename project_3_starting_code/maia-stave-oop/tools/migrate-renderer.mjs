// One-time, reproducible migration of the supplied private renderer.
// Runtime uses the committed class, never the original script or this tool.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
const input = new URL('../../maia-stave/public/composition/lib/maia_vex.js', import.meta.url);
const source = fs.readFileSync(input, 'utf8');
const ast = parse(source, { ecmaVersion: 2022, ranges: true });
const functions = new Map();
for (const node of ast.body) {
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name, node);
  else if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      if (decl.init?.type === 'FunctionExpression') functions.set(decl.id.name, decl.init);
    }
  } else if (node.expression?.right?.type === 'FunctionExpression') {
    functions.set(node.expression.left.name, node.expression.right);
  }
}
const members = new Set([...functions.keys(), 'useSmoothScroll', 'permissible_dynamics']);
const globals = new Set(['undefined', 'console', 'Array', 'Math', 'JSON', 'parseInt', 'Object', 'setInterval', 'clearInterval', 'window']);
const methods = [];
const migration = {};
for (const [name, fn] of functions) {
  // Analyze each function separately: unresolved references are dependencies or
  // the old script's accidental globals. Declare the latter per invocation.
  const text = '(' + source.slice(fn.start, fn.end) + ')';
  const tree = parse(text, { ecmaVersion: 2022, ranges: true });
  const scope = analyze(tree, { ecmaVersion: 2022, sourceType: 'script' });
  const edits = [];
  const locals = new Set();
  for (const ref of scope.globalScope.through) {
    const id = ref.identifier;
    let replacement;
    if (members.has(id.name)) replacement = 'engine.' + id.name;
    else if (id.name === 'Vex') replacement = 'engine.Vex';
    else if (id.name === '$') replacement = 'engine.jquery';
    else if (!globals.has(id.name)) locals.add(id.name);
    if (replacement) edits.push([id.start - 1 + fn.start, id.end - 1 + fn.start, replacement]);
  }
  let body = source.slice(fn.body.start + 1, fn.body.end - 1);
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    const offset = fn.body.start + 1;
    if (start >= offset && end < fn.body.end) {
      body = body.slice(0, start - offset) + replacement + body.slice(end - offset);
    }
  }
  const params = fn.params.map(p => source.slice(p.start, p.end)).join(', ');
  migration[name] = [...locals].sort();
  methods.push(`  ${name}(${params}) {\n    const engine = this;\n${locals.size ? '    let ' + [...locals].sort().join(', ') + ';\n' : ''}${body}\n  }`);
}
const header = `// Adapted from the supplied maia-stave renderer (Tom Collins and contributors).
// Private source: preserve the original README's distribution restriction.
// Generated once by tools/migrate-renderer.mjs; edit this module for future work.
// All engraving helpers are instance methods; scratch variables are call-local.
export class EngravingEngine {
  constructor({ Vex, jquery } = {}) {
    this.Vex = Vex;
    this.jquery = jquery;
    this.useSmoothScroll = false;
    this.permissible_dynamics = ['p', 'm', 'f', 's', 'z'];
  }
`;
fs.writeFileSync(new URL('../src/EngravingEngine.js', import.meta.url), header + methods.join('\n\n') + '\n}\n');
fs.writeFileSync(new URL('./migration-report.json', import.meta.url), JSON.stringify({source: fileURLToPath(input).split('/').slice(-5).join('/'), methods: migration}, null, 2) + '\n');
console.log(`Migrated ${methods.length} functions to instance methods.`);
