export function buildUnifiedDiff(oldContent: string, newContent: string): string | null {
  if (oldContent === newContent) return null;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix] === newLines[newSuffix]) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const oldChanged = oldLines.slice(prefix, oldSuffix + 1);
  const newChanged = newLines.slice(prefix, newSuffix + 1);

  const oldStart = prefix + 1;
  const newStart = prefix + 1;
  const oldCount = oldChanged.length;
  const newCount = newChanged.length;

  const hunk: string[] = [];
  hunk.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

  for (const line of oldChanged) {
    hunk.push(`-${line}`);
  }

  for (const line of newChanged) {
    hunk.push(`+${line}`);
  }

  return hunk.join("\n");
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split("\n");
}
