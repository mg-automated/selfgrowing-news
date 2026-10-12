import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { validate } from "./prediction-tracking.mjs"
import { validateGitHistory } from "./validate-prediction-history.mjs"

export function preparePublication(root, expectedHead, message, files, checkpoint = false) {
  root = realpathSync(root)
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  if (!/^[a-f0-9]{40}$/.test(expectedHead) || git("rev-parse", "HEAD") !== expectedHead) throw new Error("Checkout must match the remote head")
  if (!message.trim() || !files.length || new Set(files).size !== files.length) throw new Error("Message and distinct file paths required")
  if (checkpoint && (files.length !== 1 || files[0] !== "Data/prediction-tracking.json" || !/^tracking: reserve prediction work for \d{4}-\d{2}-\d{2}$/.test(message))) throw new Error("Checkpoint must contain only tracking data")
  validate(JSON.parse(readFileSync(path.join(root, "Data/prediction-tracking.json"), "utf8")))
  validateGitHistory(root)
  const entries = files.map(file => {
    if (path.isAbsolute(file) || file.split("/").some(part => !part || part === "." || part === ".." || part === ".git")) throw new Error("Invalid publication path")
    const absolute = realpathSync(path.join(root, file))
    if (!absolute.startsWith(root + path.sep) || !statSync(absolute).isFile()) throw new Error("Publication file must stay inside checkout")
    const bytes = readFileSync(absolute)
    const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
    const content = bytes.toString("utf8")
    if (!Buffer.from(content, "utf8").equals(bytes)) throw new Error("Publication requires UTF-8 files")
    return { path: file, mode: statSync(absolute).mode & 0o111 ? "100755" : "100644", sha, size: bytes.length, content }
  })
  return { repository: "mg-automated/selfgrowing-news", expectedHead, baseTree: git("rev-parse", "HEAD^{tree}"), message, checkpoint, entries }
}

// Transport is the authenticated GitHub connector, supplied by the cloud agent.
export async function publishBundle(bundle, connector) {
  if (bundle.repository !== "mg-automated/selfgrowing-news" || !/^[a-f0-9]{40}$/.test(bundle.expectedHead) || !bundle.entries.length) throw new Error("Invalid publication bundle")
  if (bundle.checkpoint && (bundle.entries.length !== 1 || bundle.entries[0].path !== "Data/prediction-tracking.json")) throw new Error("Checkpoint must contain only tracking data")
  if (await connector.login() !== "mg-automated") throw new Error("Publication requires mg-automated")
  if (await connector.head() !== bundle.expectedHead) throw new Error("Remote head changed; rebuild and revalidate")
  for (const entry of bundle.entries) {
    const sha = await connector.createBlob(entry.content)
    if (sha !== entry.sha) throw new Error(`Uploaded bytes differ: ${entry.path}`)
    const blob = await connector.blob(sha)
    if (blob !== entry.content) throw new Error(`Blob read-back differs: ${entry.path}`)
  }
  const tree = await connector.createTree(bundle.baseTree, bundle.entries.map(entry => ({ path: entry.path, mode: entry.mode, type: "blob", sha: entry.sha })))
  const sha = await connector.createCommit(bundle.message, bundle.expectedHead, tree)
  const commit = await connector.commit(sha)
  if (commit.tree.sha !== tree || commit.parents.length !== 1 || commit.parents[0].sha !== bundle.expectedHead || commit.author.name !== "mg-automated" || commit.committer.name !== "mg-automated") throw new Error("Commit verification failed")
  // The connector enforces the expected head atomically; never force an update.
  await connector.updateHead(sha, bundle.expectedHead)
  const published = await connector.commit(sha)
  if (published.tree.sha !== tree || await connector.head() !== sha) throw new Error("Published head changed; stop before research")
  return sha
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const option = name => args[args.indexOf(name) + 1]
  if (!["--head", "--message", "--output", "--files"].every(name => args.includes(name))) throw new Error("Require --head SHA --message TEXT --output FILE --files PATH...")
  const files = args.slice(args.indexOf("--files") + 1)
  const bundle = preparePublication(args.includes("--root") ? option("--root") : ".", option("--head"), option("--message"), files, args.includes("--checkpoint"))
  writeFileSync(option("--output"), JSON.stringify(bundle) + "\n", { mode: 0o600 })
  console.log(`Prepared ${bundle.entries.length} complete file(s); publish through the mg-automated connector`)
}
