# Cloud publication

Daily research, script execution and publication must run in the cloud. Use the GitHub connector authenticated as `mg-automated` for all writes. Do not obtain personal tokens or use a personal computer's Git credentials. Node.js and Git in an ephemeral cloud checkout are required; if cloud execution is unavailable, report that limitation rather than falling back to a personal computer.

## Prepare complete bytes

Read the current `refs/heads/main` SHA through the connector. Clone this public repository without authentication into cloud scratch space, or fetch its current head into the existing cloud checkout. Disable credential helpers and prompting:

```sh
GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c http.https://github.com/.extraheader= clone https://github.com/mg-automated/selfgrowing-news.git archive
```

Use a full checkout/history, not a shallow clone, and ensure HEAD matches the connector's remote SHA. Complete the normal content and tracking checks. Generate tracking changes exclusively with the tracking writer. Prepare an immutable bundle from the actual files, never from a displayed or truncated read result:

```sh
node site/scripts/connector-publication.mjs --head REMOTE_SHA --message "tracking: reserve prediction work for YYYY-MM-DD" --output /tmp/checkpoint-bundle.json --checkpoint --files Data/prediction-tracking.json
```

For the final daily commit, omit `--checkpoint`, use the prescribed daily message and list only the completed changed archive/data files after `--files`. Run daily-content and Outlook validation before preparing that bundle. The helper runs tracking data and full history validation even for publications that do not change tracking. Bundles are temporary and must not be committed.

## Publish through the connector

Use the exported `publishBundle(bundle, connector)` function, not a hand-reconstructed sequence that omits its checks. The function has no external dependencies and can be loaded into the cloud tool orchestrator by obtaining its complete `toString()` from Node:

```sh
node --input-type=module -e 'import {publishBundle} from "./site/scripts/connector-publication.mjs"; process.stdout.write(publishBundle.toString())'
```

Read the bundle file in full into the orchestrator. When a command tool returns its contents, request sufficient output capacity, reject truncation, and parse the entire JSON; do not paste file text manually. Evaluate the function source in that same orchestrator and supply the following adapter. Connector responses are normalized to the indicated return values:

| Adapter method | GitHub connector operation | Return value |
| --- | --- | --- |
| `login()` | `github_get_user_login` | Authenticated login |
| `head()` | `github_fetch` REST `git/ref/heads/main` | `object.sha` |
| `createBlob(content)` | `github_create_blob`, `encoding: "utf-8"` | Blob SHA |
| `blob(sha)` | `github_fetch_blob`, `blob_sha: sha` | Exact UTF-8 string from `structuredContent.content` |
| `createTree(baseTree, entries)` | `github_create_tree`, `base_tree_sha`, `tree_elements` | Tree SHA |
| `createCommit(message, parent, tree)` | `github_create_commit`, `parent_sha`, `tree_sha` | Commit SHA |
| `commit(sha)` | `github_fetch` REST `git/commits/{sha}` | Full commit JSON |
| `updateHead(sha, expected)` | `github_update_ref`, `branch_name: "main"`, `expected_sha: expected`, `force: false` | Throw on rejected/error response |

Files must round-trip as UTF-8; binary publication is outside this archive workflow. The blob reader returns decoded text, which must be compared exactly without trimming, normalization or JSON reserialization.

All calls use repository `mg-automated/selfgrowing-news`. Every adapter method must throw when a connector returns `isError` or an unsuccessful result. The helper verifies the account and starting head, creates blobs from complete bytes, compares server-computed Git hashes, reads every blob back in full, creates and verifies the commit, and updates the ref with its expected-head lease. A stale head requires fetching the new history, reconciling work, rerunning validation and preparing a fresh bundle. Never retry with force or drop the expected-head check.

The helper verifies the published commit/tree and branch head after updating it. Git objects are immutable; the verified tree refers to the already checked blobs. A failure before the ref update can leave unreachable objects but publishes no content. A failure afterward requires inspecting remote state before retrying; never repeat reserved research.

## Synchronize before tracking research

After publishing a checkpoint, fetch its exact SHA without authentication into the cloud checkout. Use `git reset --mixed CHECKPOINT_SHA` to advance local HEAD and the index while preserving drafted briefing/Outlook files. Verify the working tracking file's Git blob hash matches the published checkpoint's blob. Run:

```sh
node site/scripts/prediction-tracking.mjs --validate
node site/scripts/validate-prediction-history.mjs
```

Only then research the newly returned reserved `work`. A failed publication or check means no tracking research. Existing interrupted reservations remain spent. After final publication, verify the deployment outcome and report the actual run status.
