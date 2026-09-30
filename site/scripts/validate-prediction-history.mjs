import {execFileSync} from 'node:child_process'
import {readFileSync, existsSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {validate, migrate, validateHistory} from './prediction-tracking.mjs'

const dataPath = 'Data/prediction-tracking.json'
export function validateGitHistory(root = '.', base) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8'}).trim()
  if (base && !/^[a-f0-9]{40}$/.test(base)) throw new Error('Baseline must be a full commit SHA')
  const cache = new Map()
  const read = ref => {
    if (!cache.has(ref)) {
      if (!git('ls-tree', ref, '--', dataPath)) cache.set(ref, null)
      else {
        const raw = JSON.parse(git('show', `${ref}:${dataPath}`))
        cache.set(ref, raw.version === 1 ? migrate(raw) : validate(raw))
      }
    }
    return cache.get(ref)
  }
  // Check every transition, not just the final diff: a rewrite followed by a
  // restoration in a multi-commit push must still fail. Inspect all merge parents.
  const revisions = git('rev-list', '--reverse', '--topo-order', base ? `${base}..HEAD` : 'HEAD').split('\n').filter(Boolean)
  if (base) read(base)
  let checked = 0
  for (const sha of revisions) {
    const current = read(sha)
    const parents = git('show', '-s', '--format=%P', sha).split(' ').filter(Boolean)
    for (const parent of parents) {
      const previous = read(parent)
      if (previous && !current) throw new Error(`Prediction history deleted at ${sha}`)
      if (previous && current) {
        try {validateHistory(previous, current)} catch (error) {throw new Error(`${sha}: ${error.message}`)}
      }
    }
    if (current) checked++
    cache.clear() // Bound memory: do not retain growing JSON snapshots for all commits.
  }
  const committed = read('HEAD'), file = path.join(root, dataPath)
  if (committed && !existsSync(file)) throw new Error('Working-tree prediction history deleted')
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const working = raw.version === 1 ? migrate(raw) : validate(raw)
    if (committed) validateHistory(committed, working)
  }
  return `Prediction history valid across ${checked} committed versions`
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key)+1] : fallback
  console.log(validateGitHistory(option('--root', '.'), option('--base')))
}
