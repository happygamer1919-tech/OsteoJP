# PR assets

Images referenced from pull request descriptions (before/after screenshots, etc.)
live here, organized in one subdirectory per PR/ticket.

## Linking images from a PR description

PR asset image URLs must be pinned to a commit SHA, never to a branch name:

```
https://raw.githubusercontent.com/happygamer1919-tech/OsteoJP/<commit-sha>/docs/pr-assets/<dir>/<file>.png
```

Branch-pinned URLs (`.../OsteoJP/<branch-name>/...`) break once the branch is
deleted on merge, which happens by default for every PR in this repo. Use the
merge commit SHA (or any SHA on `main` that includes the file) so the link
keeps resolving after the branch is gone.
