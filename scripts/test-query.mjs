// Dev tool: exercise POST /api/query (SSE) end-to-end.
// Usage: node scripts/test-query.mjs <repoId> "<question>"
const repoId = Number(process.argv[2] ?? 5);
const question = process.argv[3] ?? 'res.json 方法是怎么实现的？';

const res = await fetch('http://localhost:3000/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ repoId, question }),
});
console.log('status:', res.status);
if (!res.ok || !res.body) {
  console.log(await res.text());
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let full = '';
let done = null;
while (true) {
  const { done: d, value } = await reader.read();
  if (d) break;
  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split('\n\n');
  buffer = parts.pop() ?? '';
  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const payload = JSON.parse(line.slice(5).trim());
    if (payload.type === 'keywords') console.log('\n[keywords]', payload.keywords);
    else if (payload.type === 'delta') full += payload.d;
    else if (payload.type === 'done') done = payload;
    else if (payload.type === 'error') console.log('\n[error]', payload.message);
  }
}
console.log('\n=== ANSWER ===');
console.log(full);
if (done) {
  console.log('\n=== CITATIONS ===');
  for (const c of done.citations) console.log(`  ${c.file}${c.line ? `:${c.line}` : ''}`);
  console.log('\nquestionId:', done.questionId, '| latency:', done.latencyMs, 'ms');
}
