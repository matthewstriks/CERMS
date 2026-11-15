import { readFile, writeFile } from 'node:fs/promises'
import { prepareChangelog } from './changelog.cjs'
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const file = new URL('../CHANGELOG.md', import.meta.url)
const result = prepareChangelog(await readFile(file, 'utf8'), pkg.version)
if (result.changed) await writeFile(file, result.source)
console.log(
  `Changelog ${result.changed ? 'recorded' : 'already recorded'} for ${pkg.version}. No release was published.`,
)
