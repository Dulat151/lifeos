#!/bin/bash
# Exports every Apple Notes note (all accounts, all folders) to HTML files and packs them into a ZIP
# that LIFE OS can import (Settings -> Import notes). Runs only on your Mac; nothing is uploaded.
# macOS asks once for permission to control "Notes" — allow it.
# Password-protected (locked) notes are skipped: Apple does not expose their content.
#
# Usage: scripts/export-apple-notes.sh [output-folder]     (default: ~/Desktop/apple-notes-export)
set -euo pipefail

OUT="${1:-$HOME/Desktop/apple-notes-export}"
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

osascript -l JavaScript - "$OUT" <<'JXA'
ObjC.import('Foundation');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function safe(s) {
  return (s || 'Без названия').replace(/[\/\\:*?"<>|\n\r]/g, '-').trim().slice(0, 100) || 'note';
}
function write(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}
function mkdir(path) {
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, $(), null);
}

function run(argv) {
  const out = argv[0];
  const Notes = Application('Notes');
  const skipFolders = ['Recently Deleted', 'Недавно удаленные', 'Недавно удалённые', 'Жақында жойылғандар'];
  const used = {};
  let exported = 0, locked = 0;
  Notes.notes().forEach(function (note) {
    let folder = 'Notes';
    try { folder = note.container().name(); } catch (e) {}
    if (skipFolders.indexOf(folder) !== -1) return;
    let body;
    try {
      if (note.passwordProtected()) { locked++; return; }
      body = note.body();
    } catch (e) { locked++; return; }
    const name = note.name();
    const dir = out + '/' + safe(folder);
    mkdir(dir);
    let file = safe(name), i = 1;
    while (used[dir + '/' + file]) { file = safe(name) + ' (' + (++i) + ')'; }
    used[dir + '/' + file] = true;
    write(dir + '/' + file + '.html',
      '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(name) + '</title></head><body>' +
      body + '</body></html>');
    exported++;
  });
  return 'Exported: ' + exported + (locked ? ', skipped locked: ' + locked : '');
}
JXA

(cd "$OUT" && zip -qr "$OUT.zip" .)
echo "ZIP ready: $OUT.zip"
echo "Upload it in LIFE OS: Settings -> Import notes."
