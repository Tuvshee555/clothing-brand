@AGENTS.md

## Git: only `main`

- `main` is the only branch that stays. Work on a short-lived branch when needed, then merge
  it into `main` and delete it locally and on GitHub as soon as the job is done.
- Finished work that must wait (a client's permission, an owner decision) is parked as a
  patch in `docs/pending/`, not as a long-lived branch.
- Before ending a task, check `git ls-remote --heads origin` lists only `main`.
