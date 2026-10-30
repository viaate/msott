// A stand-in for the Anthropic client that replays scripted turns as stream
// events, so the agent loop can be tested without an API key.
export function fakeClient(turns) {
  let n = 0;
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params) {
          calls.push(structuredClone(params));
          const blocks = turns[n++] ?? [{ type: 'tool_use', name: 'nap', input: { minutes: 30 } }];
          const id = `msg_${n}`;
          const content = blocks.map((b, i) => (b.type === 'tool_use' ? { ...b, id: b.id ?? `toolu_${n}_${i}` } : b));
          const events = [{ type: 'message_start', message: { id } }];
          content.forEach((b, index) => {
            if (b.type === 'tool_use') {
              events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
              const json = JSON.stringify(b.input);
              for (let i = 0; i < json.length; i += 40) events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 40) } });
            } else {
              const key = b.type === 'thinking' ? 'thinking' : 'text';
              events.push({ type: 'content_block_start', index, content_block: { type: b.type, [key]: '' } });
              events.push({ type: 'content_block_delta', index, delta: { type: `${key}_delta`, [key]: b[key] } });
            }
            events.push({ type: 'content_block_stop', index });
          });
          const stop = content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
          const message = { id, type: 'message', role: 'assistant', content, stop_reason: stop, usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 } };
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of events) yield e;
            },
            finalMessage: async () => message,
          };
        },
      },
    },
  };
}
