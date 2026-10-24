'use strict';
self.onmessage = event => {
  try {
    const {p, f, t, r} = event.data;
    const re = new RegExp(p, f);
    const matches = [];
    let match, guard = 0;
    while ((match = re.exec(t)) !== null) {
      matches.push({value: match[0], index: match.index, groups: Array.from(match).slice(1), end: match.index + match[0].length});
      if (!re.global) break;
      if (++guard > 1000) break;
      if (match[0] === '') re.lastIndex++;
    }
    self.postMessage({matches, replaced: r === null ? null : t.replace(re, r)});
  } catch (error) {
    self.postMessage({error: String(error && error.message || error)});
  }
};
