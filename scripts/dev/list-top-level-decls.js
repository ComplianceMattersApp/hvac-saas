// scripts/dev/list-top-level-decls.js
//
// Lists every top-level declaration in a TypeScript file with its exact line
// range, export status, and the other top-level names it references, using the
// TypeScript compiler API.
//
// Written for the job-actions.ts decomposition (see
// docs/ACTIVE/JOB_ACTIONS_DECOMPOSITION_PLAN.md). Regex-based declaration
// finding silently mistook a local variable whose initializer opened with a
// parenthesis for a top-level arrow function, and relocated it out of the
// middle of its owning function. Use this instead.
//
// Usage: node scripts/dev/list-top-level-decls.js <file.ts>

const ts = require("typescript"), fs = require("fs");
const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const line = p => sf.getLineAndCharacterOfPosition(p).line + 1;

const decls = [];
for (const st of sf.statements) {
  const isExported = !!(st.modifiers || []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  const start = line(st.getStart(sf)), end = line(st.getEnd());
  const add = (name, kind) => decls.push({ name, kind, isExported, start, end });
  switch (st.kind) {
    case ts.SyntaxKind.FunctionDeclaration:
      if (st.name) add(st.name.text, "function"); break;
    case ts.SyntaxKind.VariableStatement:
      for (const d of st.declarationList.declarations)
        if (d.name.kind === ts.SyntaxKind.Identifier) add(d.name.text, "const");
      break;
    case ts.SyntaxKind.TypeAliasDeclaration: add(st.name.text, "type"); break;
    case ts.SyntaxKind.InterfaceDeclaration: add(st.name.text, "interface"); break;
    case ts.SyntaxKind.ClassDeclaration: if (st.name) add(st.name.text, "class"); break;
  }
}
const byName = new Map(decls.map(d => [d.name, d]));
const refs = {};
for (const st of sf.statements) {
  const owners = decls.filter(d => d.start === line(st.getStart(sf)));
  if (!owners.length) continue;
  const seen = new Set();
  (function walk(n) {
    if (n.kind === ts.SyntaxKind.Identifier && byName.has(n.text)) seen.add(n.text);
    n.forEachChild(walk);
  })(st);
  for (const o of owners) { const s = new Set(seen); s.delete(o.name); refs[o.name] = [...s]; }
}
console.log(JSON.stringify({ decls, refs }, null, 1));
