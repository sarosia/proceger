const path = require('path');
const fs = require('fs/promises');
const {existsSync} = require('fs');

/**
 * Merges entries across multiple log files chronologically.
 * @param {Array<string>} dirs Candidate directories where log files may exist.
 * @param {Array<string>} filenames Sorted log filenames (newest first).
 * @param {Object} [options={}] Options such as tail line count.
 * @param {Object} [logger] Optional logger for debug output.
 * @return {Promise<Object>} Merged log content object.
 */
async function mergeLogFiles(dirs, filenames, options = {}, logger = null) {
  if (!filenames || filenames.length === 0) {
    return {
      filename: 'All Logs (Merged)',
      content: '',
      totalLines: 0,
    };
  }

  const candidateFiles = filenames.slice(0, 5);
  const parsedEntries = [];

  for (const filename of candidateFiles) {
    for (const dir of dirs) {
      const fullPath = path.join(dir, filename);
      if (existsSync(fullPath)) {
        try {
          const stat = await fs.stat(fullPath);
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            if (!line.trim()) continue;
            let lineTime = stat.mtimeMs;
            let rawLine = line;
            try {
              const parsed = JSON.parse(line);
              if (parsed && typeof parsed === 'object') {
                if (parsed.timestamp) {
                  const t = Date.parse(parsed.timestamp);
                  if (!isNaN(t)) lineTime = t;
                }
                if (!parsed.file) {
                  parsed.file = filename;
                }
                rawLine = JSON.stringify(parsed);
              }
            } catch (_) {
              const match = line.match(/^\[(\d{4}-\d{2}-\d{2}[^\]]+)\]/);
              if (match) {
                const t = Date.parse(match[1]);
                if (!isNaN(t)) lineTime = t;
              }
            }
            parsedEntries.push({
              time: lineTime,
              raw: rawLine,
              file: filename,
              order: idx,
            });
          }
        } catch (err) {
          if (logger && logger.debug) {
            logger.debug(`Error reading log file ${fullPath}: ${err.message}`);
          }
        }
        break;
      }
    }
  }

  parsedEntries.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.order - b.order;
  });

  const totalLines = parsedEntries.length;
  const finalEntries = (options.tail && options.tail > 0) ?
    parsedEntries.slice(-options.tail) :
    parsedEntries;

  return {
    filename: 'All Logs (Merged)',
    content: finalEntries.map((e) => e.raw).join('\n') +
      (finalEntries.length > 0 ? '\n' : ''),
    totalLines,
  };
}

module.exports = {
  mergeLogFiles,
};
