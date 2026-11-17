// Narrow host integration changes; the cleaner's recovery, tags and git checks stay upstream.
export function portCleaner(source) {
  const once = (before, after) => {
    if (source.split(before).length !== 2) throw Error('cleaner source changed; port requires review');
    source = source.replace(before, after);
  };
  once("import { homedir } from 'node:os';", "import { homedir } from 'node:os';\nimport { codexSessionCwds, codexWorktrees } from './cleaner-sessions.mjs';");
  const session = source.match(/export function sessionCwds\(home, platform = process\.platform\) \{[\s\S]*?\n\}/)?.[0];
  if (!session) throw Error('cleaner session reader changed');
  once(session, 'export function sessionCwds(home, platform = process.platform) {\n  return codexSessionCwds(home);\n}');
  once("if (isLink(path, platform) || isLink(join(main, '.claude'), platform) || isLink(join(main, '.claude', 'worktrees'), platform)) return null;", "if (isLink(path, platform) || isLink(dirname(path), platform) || isLink(dirname(dirname(path)), platform) || isLink(dirname(dirname(dirname(path))), platform)) return null;");
  once("if (isLink(join(main, '.claude'), platform) || isLink(join(main, '.claude', 'worktrees'), platform)) throw new Unavailable('the worktrees folder or its parent is a link');", "const container = codexWorktrees(home);\n  if (isLink(dirname(container), platform) || isLink(container, platform)) throw new Unavailable('the worktrees folder or its parent is a link');");
  once("const container = join(main, '.claude', 'worktrees');", '// The Codex worktree root can be on a separate drive.');
  once('if (fold(dirname(path), platform) !== fold(container, platform)) continue;', 'if (fold(dirname(dirname(path)), platform) !== fold(container, platform)) continue;');
  once('const name = basename(path);', 'const name = basename(dirname(path));');
  return source;
}
