#!/usr/bin/env node
/**
 * Copies repository documentation into the Obsidian vault.
 *
 * One-way by design: the repository is the source of truth, so notes edited directly in
 * Obsidian are overwritten. Anything worth keeping must move back into docs/.
 *
 * Vault location is overridable with KV_VAULT_DIR, so this works on another machine.
 */
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const vaultRoot =
  process.env.KV_VAULT_DIR ??
  join(
    homedir(),
    'Library/Mobile Documents/com~apple~CloudDocs/Projecten/kv',
  );

const target = join(vaultRoot, 'KV-Eendracht');

// Root-level Markdown that belongs in the vault alongside docs/.
const rootDocs = [
  ['CLAUDE.md', 'Plan/CLAUDE.md'],
  ['README.md', 'Plan/README.md'],
];

async function collectMarkdown(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdown(full, base)));
    else if (entry.name.endsWith('.md')) out.push(relative(base, full));
  }
  return out;
}

async function main() {
  if (!existsSync(vaultRoot)) {
    console.error(`Vault not found: ${vaultRoot}`);
    console.error('Set KV_VAULT_DIR to the correct path.');
    process.exit(1);
  }

  // Replace wholesale so notes deleted in the repo also disappear from the vault.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const docsDir = join(repoRoot, 'docs');
  const files = await collectMarkdown(docsDir);

  for (const rel of files) {
    const dest = join(target, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(docsDir, rel), dest);
  }

  let extra = 0;
  for (const [src, rel] of rootDocs) {
    const from = join(repoRoot, src);
    if (!existsSync(from)) continue;
    const dest = join(target, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(from, dest);
    extra += 1;
  }

  // A note at the vault root so the hub is findable without knowing the folder layout.
  await writeFile(
    join(vaultRoot, 'Welkom.md'),
    [
      '---',
      'title: Welkom',
      'tags: [index]',
      '---',
      '',
      '# Welkom',
      '',
      'Deze vault bevat de documentatie van de **KV Eendracht** app.',
      '',
      'Begin bij [[KV Eendracht — MOC]] — dat is het knooppunt met links naar de',
      'specificatie, de architectuur, de besluiten (ADRs) en de sportregels.',
      '',
      'Open de grafiekweergave (⌘G) om te zien hoe de notities samenhangen.',
      '',
      '> Deze map wordt gegenereerd vanuit de repository (`pnpm docs:sync`).',
      '> Wijzigingen die je hier maakt worden bij de volgende sync overschreven.',
      '',
    ].join('\n'),
    'utf8',
  );

  const bytes = (
    await Promise.all(
      files.map(async (f) => (await stat(join(docsDir, f))).size),
    )
  ).reduce((a, b) => a + b, 0);

  console.log(`Synced ${files.length + extra} notes (${Math.round(bytes / 1024)} KB) to:`);
  console.log(`  ${target}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
