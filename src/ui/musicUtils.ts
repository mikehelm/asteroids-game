// Music utils (extracted from Game.tsx). No behavior changes.
export const formatTrackName = (raw: string): string => {
  // Remove leading patterns like '01 ', '1_', 'S1 -', 's12.' and common separators
  const stripped = raw.replace(/^\s*(?:[0-9]+|[sS][0-9]+)[\s._-]*/,'').trim();
  return stripped || raw;
};
