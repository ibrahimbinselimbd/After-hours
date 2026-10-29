(() => {
  'use strict';

  const LIMIT = 120000;
  const MAX_TOKENS = 14000;
  const MAX_DEPTH = 50;
  const engine = {
    title: 'GraphQL Query / Variables Validator',
    description: 'Parse a bounded GraphQL query and JSON variables locally, then explain syntax, operation, fragment, variable, and optional minimal-schema issues. No query is sent anywhere.',
    limitations: 'This is a practical subset validator, not a GraphQL server or full spec implementation. A supplied schema is optional and must be compact SDL or a JSON map of type names to field return types; directives, custom scalars, interfaces/unions, introspection, authorization, resolver behavior, server rules, and complete input coercion are not modeled. Complete type validation requires the full schema and runtime. Inputs are capped at 120,000 characters and 14,000 tokens.',
    fields: [
      { id: 'query', label: 'GraphQL query', type: 'textarea', placeholder: 'query GetUser($id: ID!) { user(id: $id) { id name } }', help: 'Paste one or more operations and fragments. Anonymous shorthand queries are supported.' },
      { id: 'variables', label: 'JSON variables (optional)', type: 'textarea', placeholder: '{"id":"user-1"}', help: 'Must be one JSON object. Variables are checked against declared types for basic presence, nullability, and scalar shape.' },
      { id: 'schema', label: 'Minimal schema (optional)', type: 'textarea', placeholder: 'type Query { user: User }\ntype User { id: ID! name: String }', help: 'Use compact SDL type blocks or JSON such as {"Query":{"user":"User"},"User":{"id":"ID!","name":"String"}}.' }
    ],

    run(values) {
      const query = String(values && values.query || '').replace(/^\uFEFF/, '');
      const variableText = String(values && values.variables || '').trim();
      const schemaText = String(values && values.schema || '').trim();
      if (!query.trim()) return 'No GraphQL query supplied. Paste an operation or anonymous selection set.';
      if (query.length > LIMIT || variableText.length > LIMIT || schemaText.length > LIMIT) return 'Input exceeds the 120,000-character local limit. Shorten the pasted query, variables, or schema.';

      const notes = [], errors = [], warnings = [];
      let tokens;
      try { tokens = lex(query); } catch (e) { return 'Query syntax error: ' + e.message; }
      if (tokens.length > MAX_TOKENS) return 'Query is too complex for this browser-local check: maximum 14,000 tokens.';
      const parser = new Parser(tokens, errors);
      const document = parser.document();
      if (parser.pos < tokens.length - 1) errors.push('Unexpected token “' + tokens[parser.pos].value + '” after the document.');
      if (errors.length) return format('GraphQL query diagnostics', errors, warnings, notes);

      let variables = {};
      if (variableText) {
        try {
          variables = JSON.parse(variableText);
          if (!variables || Array.isArray(variables) || typeof variables !== 'object') errors.push('Variables JSON must be an object, not an array or scalar.');
        } catch (e) { errors.push('Variables JSON is invalid: ' + e.message); }
      }
      let schema = null;
      if (schemaText) {
        try { schema = parseSchema(schemaText); }
        catch (e) { errors.push('Minimal schema could not be read: ' + e.message); }
      }

      const operations = document.definitions.filter(d => d.kind === 'operation');
      const fragments = Object.create(null);
      document.definitions.filter(d => d.kind === 'fragment').forEach(f => {
        if (fragments[f.name]) errors.push('Fragment “' + f.name + '” is defined more than once.');
        fragments[f.name] = f;
      });
      if (!operations.length && !document.definitions.some(d => d.kind === 'fragment')) errors.push('No operation or fragment was found.');
      const names = operations.map(o => o.name).filter(Boolean);
      if (names.length !== new Set(names).size) errors.push('Operation names must be unique within a document.');
      const declared = Object.create(null), used = Object.create(null);
      operations.forEach(op => {
        op.vars.forEach(v => {
          if (declared[v.name]) errors.push('Variable “$' + v.name + '” is declared more than once.');
          declared[v.name] = v;
        });
        walkSelection(op.selection, field => {
          field.args.forEach(a => collectVars(a.value, used));
          field.directives.forEach(d => d.args.forEach(a => collectVars(a.value, used)));
        }, spread => {
          if (!fragments[spread]) errors.push('Operation “' + (op.name || 'anonymous') + '” references missing fragment “' + spread + '”.');
        });
        Object.keys(used).forEach(v => { if (!declared[v]) errors.push('Variable “$' + v + '” is used but not declared in operation “' + (op.name || 'anonymous') + '”.'); });
        Object.keys(declared).forEach(v => { if (!used[v]) warnings.push('Variable “$' + v + '” is declared but not used in operation “' + (op.name || 'anonymous') + '”.'); });
        Object.keys(used).forEach(v => { if (Object.prototype.hasOwnProperty.call(variables, v) === false) warnings.push('Variable “$' + v + '” has no supplied value.'); });
        op.vars.forEach(v => checkVariableValue(v, variables, errors, warnings));
      });
      Object.keys(fragments).forEach(name => {
        walkSelection(fragments[name].selection, () => {}, spread => { if (!fragments[spread]) errors.push('Fragment “' + name + '” references missing fragment “' + spread + '”.'); });
      });
      if (schema) validateSchemaFields(document, schema, warnings);
      const summary = operations.map(o => (o.name || 'anonymous') + ' (' + o.type + ', ' + countFields(o.selection) + ' field' + (countFields(o.selection) === 1 ? '' : 's') + ')').join(', ');
      notes.push('Parsed ' + operations.length + ' operation' + (operations.length === 1 ? '' : 's') + (fragments ? ' and ' + Object.keys(fragments).length + ' fragment' + (Object.keys(fragments).length === 1 ? '' : 's') : '') + '.');
      notes.push('Operations: ' + (summary || 'none') + '.');
      notes.push(schema ? 'Minimal schema checks were applied where the supplied schema exposed a field.' : 'No schema supplied: field existence and complete type compatibility were not checked.');
      if (variableText && !errors.some(e => e.indexOf('Variables JSON') === 0)) notes.push('Variables JSON parsed as an object with ' + Object.keys(variables).length + ' key' + (Object.keys(variables).length === 1 ? '' : 's') + '.');
      return format('GraphQL query diagnostics', errors, warnings, notes);
    }
  };

  function token(kind, value, line, col) { return {kind, value, line, col}; }
  function lex(source) {
    const out = []; let i = 0, line = 1, col = 1;
    const bump = (s) => { for (const c of s) { if (c === '\n') { line++; col = 1; } else col++; } };
    while (i < source.length) {
      const c = source[i];
      if (/\s|,/.test(c)) { bump(c); i++; continue; }
      if (c === '#') { const j = source.indexOf('\n', i); const s = source.slice(i, j < 0 ? source.length : j); bump(s); i += s.length; continue; }
      const l = line, p = col;
      if (source.startsWith('...', i)) { out.push(token('punct', '...', l, p)); bump('...'); i += 3; continue; }
      if ('!$():=@[]{|}&'.includes(c)) { out.push(token('punct', c, l, p)); bump(c); i++; continue; }
      if (c === '"') {
        let j = i + 1, escaped = false;
        while (j < source.length) { if (!escaped && source[j] === '"') break; if (!escaped && source[j] === '\n') throw new Error('Unterminated string at line ' + l + '.'); escaped = !escaped && source[j] === '\\'; if (source[j] !== '\\') escaped = false; j++; }
        if (j >= source.length) throw new Error('Unterminated string at line ' + l + '.');
        const raw = source.slice(i, j + 1); out.push(token('string', raw, l, p)); bump(raw); i = j + 1; continue;
      }
      const word = source.slice(i).match(/^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|[_A-Za-z][_0-9A-Za-z]*)/);
      if (word) { out.push(token('name', word[0], l, p)); bump(word[0]); i += word[0].length; continue; }
      throw new Error('Unexpected character “' + c + '” at line ' + l + ', column ' + p + '.');
    }
    out.push(token('eof', '', line, col)); return out;
  }

  class Parser {
    constructor(tokens, errors) { this.t = tokens; this.pos = 0; this.errors = errors; this.depth = 0; }
    peek(v) { return this.t[this.pos].value === v; }
    take(v) { if (v && !this.peek(v)) this.fail('Expected “' + v + '” but found “' + (this.t[this.pos].value || 'end') + '”.'); return this.t[this.pos++]; }
    name() { const x = this.take(); if (x.kind !== 'name') this.fail('Expected a name but found “' + (x.value || 'end') + '”.'); return x.value; }
    fail(msg) { this.errors.push(msg + ' (line ' + this.t[this.pos].line + ', column ' + this.t[this.pos].col + ')'); throw new Error(msg); }
    document() { const ds = []; while (!this.peek('')) { try { ds.push(this.definition()); } catch (_) { while (!this.peek('') && !this.peek('query') && !this.peek('mutation') && !this.peek('subscription') && !this.peek('fragment') && !this.peek('{')) this.pos++; } } return {definitions: ds}; }
    definition() { if (this.peek('{')) return {kind:'operation', type:'query', name:null, vars:[], selection:this.selection()}; const k = this.name(); if (k === 'fragment') { const name = this.name(); this.take('on'); const type = this.name(); return {kind:'fragment', name, type, selection:this.selection()}; } if (!['query','mutation','subscription'].includes(k)) this.fail('Expected query, mutation, subscription, fragment, or “{”.'); const name = this.peek('(') || this.peek('{') ? null : this.name(); const vars = this.peek('(') ? this.variableDefs() : []; while (this.peek('@')) this.directive(); return {kind:'operation', type:k, name, vars, selection:this.selection()}; }
    variableDefs() { const a=[]; this.take('('); while (!this.peek(')')) { this.take('$'); const name=this.name(); this.take(':'); const type=this.typeRef(); let defaultValue=null; if (this.peek('=')) { this.take('='); defaultValue=this.value(); } while(this.peek('@')) this.directive(); a.push({name,type,defaultValue}); } this.take(')'); return a; }
    typeRef() { let x; if (this.peek('[')) { this.take('['); x={kind:'list',of:this.typeRef()}; this.take(']'); } else x={kind:'named',name:this.name()}; if(this.peek('!')) {this.take('!'); x.nonNull=true;} return x; }
    selection() { if (++this.depth > MAX_DEPTH) this.fail('Selection nesting exceeds the local depth limit of ' + MAX_DEPTH + '.'); this.take('{'); const a=[]; while(!this.peek('}') && !this.peek('')) { if(this.peek('...')) {this.take('...'); if(this.peek('on')) {this.take('on'); const type=this.name(); while(this.peek('@')) this.directive(); a.push({kind:'inline',type,selection:this.selection()});} else { const name=this.name(); while(this.peek('@')) this.directive(); a.push({kind:'spread',name}); } } else a.push(this.field()); } this.take('}'); this.depth--; return a; }
    field() { const first=this.name(); let name=first, alias=null; if(this.peek(':')) {this.take(':'); alias=first; name=this.name();} const args=this.peek('(')?this.arguments():[]; const directives=[]; while(this.peek('@')) directives.push(this.directive()); const selection=this.peek('{')?this.selection():null; return {kind:'field',name,alias,args,directives,selection}; }
    arguments() { const a=[]; this.take('('); while(!this.peek(')')) {const name=this.name();this.take(':');a.push({name,value:this.value()});}this.take(')');return a; }
    directive() {this.take('@');const name=this.name();const args=this.peek('(')?this.arguments():[];return {name,args};}
    value() { if(this.peek('$')) {this.take('$');return {kind:'var',name:this.name()};} if(this.peek('[')){this.take('[');const a=[];while(!this.peek(']'))a.push(this.value());this.take(']');return {kind:'list',values:a};} if(this.peek('{')){this.take('{');const a=[];while(!this.peek('}')){const n=this.name();this.take(':');a.push({name:n,value:this.value()});}this.take('}');return {kind:'object',fields:a};} const x=this.take(); if(x.kind==='string'||x.kind==='name')return {kind:'literal',value:x.value}; this.fail('Expected a GraphQL value.'); }
  }

  function parseSchema(text) {
    if (text[0] === '{') { const x=JSON.parse(text); const out={}; Object.keys(x).forEach(t => { out[t]={}; Object.keys(x[t] || {}).forEach(f => { out[t][f]=String(x[t][f]); }); }); return out; }
    const out={}; const re=/\btype\s+([_A-Za-z][_0-9A-Za-z]*)\s*(?:implements[^\{]+)?\{([^}]*)\}/g; let m, found=false;
    while ((m=re.exec(text))) { found=true; const fields={}; const body=m[2].replace(/#[^\n]*/g,''); const fr=/([_A-Za-z][_0-9A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*([\[\]!_A-Za-z0-9]+)/g; let f; while((f=fr.exec(body))) fields[f[1]]=f[2]; out[m[1]]=fields; }
    if (!found) throw new Error('Use SDL type blocks such as “type Query { user: User }” or a JSON type-to-field map.'); return out;
  }
  function walkSelection(sel, fieldFn, spreadFn) { (sel || []).forEach(x => { if(x.kind==='field'){fieldFn(x); if(x.selection)walkSelection(x.selection,fieldFn,spreadFn);} else if(x.kind==='spread'){spreadFn(x.name);} else if(x.selection)walkSelection(x.selection,fieldFn,spreadFn); }); }
  function collectVars(v, used) { if(!v)return; if(v.kind==='var')used[v.name]=true; else if(v.kind==='list')v.values.forEach(x=>collectVars(x,used)); else if(v.kind==='object')v.fields.forEach(x=>collectVars(x.value,used)); }
  function checkVariableValue(v, values, errors, warnings) { if(!Object.prototype.hasOwnProperty.call(values,v.name)) { if(!v.type.nonNull || v.defaultValue !== null) return; return; } const value=values[v.name]; if(value===null && v.type.nonNull) errors.push('Variable “$'+v.name+'” is non-null ('+typeText(v.type)+') but its supplied value is null.'); const n=v.type.name || (v.type.of && v.type.of.name); if(value!==null && n==='Int' && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) errors.push('Variable “$'+v.name+'” should be a GraphQL Int-shaped JSON value.'); if(value!==null && n==='Boolean' && typeof value!=='boolean') warnings.push('Variable “$'+v.name+'” is declared Boolean but its JSON value is not boolean-shaped.'); if(value!==null && n==='Float' && typeof value!=='number') warnings.push('Variable “$'+v.name+'” is declared Float but its JSON value is not number-shaped.'); }
  function typeText(t) { return t.kind==='list'?'['+typeText(t.of)+']'+(t.nonNull?'!':''):t.name+(t.nonNull?'!':''); }
  function validateSchemaFields(doc, schema, warnings) { doc.definitions.filter(d=>d.kind==='operation').forEach(op=>{ const root=schema[op.type[0].toUpperCase()+op.type.slice(1)]; if(!root)return; walkTyped(op.selection,root,schema,warnings); }); }
  function walkTyped(sel, parent, schema, warnings) { (sel||[]).forEach(f=>{if(f.kind!=='field')return; if(!parent[f.name]) warnings.push('Field “'+f.name+'” is not present in supplied minimal schema type “'+(parent.__name||'root')+'” (or the schema is incomplete).'); else { const next=(schema[parent[f.name]]||schema[String(parent[f.name]).replace(/[\[\]!]/g,'')]); if(f.selection && next) walkTyped(f.selection,next,schema,warnings); }}); }
  function countFields(sel) { let n=0; walkSelection(sel,()=>n++,()=>{}); return n; }
  function format(title, errors, warnings, notes) { const lines=[title+':']; if(errors.length) lines.push('Errors ('+errors.length+'):','- '+errors.join('\n- ')); else lines.push('Errors: none found in the supported subset.'); if(warnings.length) lines.push('Warnings ('+warnings.length+'):','- '+warnings.join('\n- ')); if(notes.length) lines.push('Notes:','- '+notes.join('\n- ')); return lines.join('\n'); }

  window.AHDevToolEngines = window.AHDevToolEngines || {};
  window.AHDevToolEngines['graphql-query-validator'] = engine;
})();
