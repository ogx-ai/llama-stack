# OGX Technical Whitepaper (LaTeX)

This directory holds `ogx.tex` (and its build artifacts `ogx.bbl`, `ogx.pdf`,
`references.bib`), a standalone, diagram-heavy technical whitepaper. **It is a
separate document from the JOSS submission**, not an alternate build of it.

- **JOSS manuscript:** [`paper.md`](https://github.com/ogx-ai/ogx/blob/7ce8d77a4faa98863529f227d874b75770b6c805/paper.md)
  and [`paper.bib`](https://github.com/ogx-ai/ogx/blob/7ce8d77a4faa98863529f227d874b75770b6c805/paper.bib)
  at commit `7ce8d77a4faa98863529f227d874b75770b6c805`, including the
  shortened manuscript, corrected SGLang reference, revised deployment
  wording, and versioned source citations recorded below. These links
  identify the manuscript independently of the
  software release tag.
- **This whitepaper:** `ogx.tex`, built against `references.bib` and `ogx.bbl`
  in this directory. It shares subject matter with `paper.md` but is
  maintained independently, is not kept in lockstep with it, and is not part
  of the JOSS submission.

Both documents currently share the same title, which has caused confusion
about which one the JOSS proof corresponds to. If you're looking for the JOSS
manuscript, use the pinned links above.

## Source references

The software version for this revision, operator source reference, and revised
manuscript are identified independently:

| Component | Revision | Reference |
| --- | --- | --- |
| OGX software | `v1.0.3` | commit `5393c94b2d23a3069b3708f9ca81ad350d2deb21` |
| OGX Kubernetes Operator | `v0.10.0` | commit `7fa16532e1434bf74493ca305b1e21030914ae57` |
| Manuscript (`paper.md` / `paper.bib`) | -- | commit `7ce8d77a4faa98863529f227d874b75770b6c805` |

The operator reference is an existing tagged source snapshot. Its
[`OGXServer` API](https://github.com/ogx-ai/ogx-k8s-operator/blob/7fa16532e1434bf74493ca305b1e21030914ae57/api/v1beta1/ogxserver_types.go)
and [deployment documentation](https://github.com/ogx-ai/ogx-k8s-operator/blob/7fa16532e1434bf74493ca305b1e21030914ae57/README.md)
describe the custom resource, network policies, ConfigMap image overrides,
Kubernetes/OpenShift deployment, and multi-architecture builds discussed in
the manuscript. This citation identifies source for those features; it does
not establish the operator version used by historical deployments.

## JOSS proof

The [JOSS proof generated on 10 September 2026](https://github.com/openjournals/joss-papers/blob/45c9cbbc304d51ba94241c9ecd1322574bfcd7e8/joss.11234/10.21105.joss.11234.pdf)
contains the revised deployment wording, OGX `v1.0.2` citation, and versioned
operator citation. Its corresponding manuscript pair is pinned at
[`3a1e778b362a5f827796b0dd3529bd883607ed59`](https://github.com/ogx-ai/ogx/tree/3a1e778b362a5f827796b0dd3529bd883607ed59);
those files are byte-identical to the merged source when the proof was
requested. This identifies a source snapshot, without claiming the bot's
checkout commit. The PDF SHA-256 is
`e7c843d2b827bbb9333d7d1df33c83aa1da84300899f83e0eaaaa15a48730b57`.

That proof predates the shortened manuscript, OGX `v1.0.3` citation, and
corrected SGLang reference pinned above. After merging those updates, run
`@editorialbot generate pdf` on the
[JOSS review issue](https://github.com/openjournals/joss-reviews/issues/11234)
to generate a proof with the final manuscript, and
record the new proof link alongside its manuscript source revision. If either
manuscript file changes, update both source links and the table before
regenerating the proof.
