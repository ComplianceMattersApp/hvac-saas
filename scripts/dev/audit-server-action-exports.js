// scripts/dev/audit-server-action-exports.js
//
// Lists exported functions in every file-level "use server" module and flags
// those never referenced from app/, never bound as a form action, and never
// imported by a client component.
//
// In a "use server" module every export becomes a public POST endpoint, so a
// helper-shaped export publishes an endpoint nobody asked for. Three were found
// by hand in job-actions.ts (insertJobEvent, ensureActiveAssignmentAndNotify,
// createJob) before this was written.
//
// Output is a CANDIDATE list, not a defect list. Confirm each by hand: the scan
// is name-based, so dynamic dispatch or re-export barrels can hide a real use.
//
// Usage: NODE_PATH=./node_modules node scripts/dev/audit-server-action-exports.js

const ts=require("typescript"), fs=require("fs"), path=require("path");
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name);
  if(e.isDirectory()){ if(!/node_modules|\.next|\.git/.test(p)) walk(p,out); }
  else if(/\.(ts|tsx)$/.test(e.name)) out.push(p);} return out;}
const files=["app","lib","components"].flatMap(d=>fs.existsSync(d)?walk(d):[]);
const srcOf=new Map(files.map(f=>[f,fs.readFileSync(f,"utf8")]));

// files carrying a file-level "use server"
const serverFiles=files.filter(f=>{
  const s=srcOf.get(f);
  return /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\n|\s*\n)*\s*["']use server["'];/.test(s);
});
const clientFiles=new Set(files.filter(f=>/^\s*["']use client["'];/m.test(srcOf.get(f))));

const rows=[];
for(const f of serverFiles){
  const s=srcOf.get(f);
  const sf=ts.createSourceFile(f,s,ts.ScriptTarget.ESNext,true,ts.ScriptKind.TS);
  for(const st of sf.statements){
    if(st.kind!==ts.SyntaxKind.FunctionDeclaration||!st.name) continue;
    if(!(st.modifiers||[]).some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) continue;
    const name=st.name.text;
    const re=new RegExp("\\b"+name+"\\b");
    let appRef=false, formAction=false, clientImport=false;
    for(const g of files){
      if(g===f) continue;
      const t=srcOf.get(g);
      if(!re.test(t)) continue;
      if(g.startsWith("app"+path.sep)&&!/__tests__/.test(g)) appRef=true;
      if(new RegExp("action=\\{\\s*"+name+"\\b").test(t)) formAction=true;
      if(clientFiles.has(g)) clientImport=true;
    }
    rows.push({file:f,name,appRef,formAction,clientImport});
  }
}
console.log(JSON.stringify(rows,null,1));
