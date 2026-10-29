# Herdr Plannotator

Herdr Plannotator opens Plannotator's existing review page in a
[terminal-browser](https://terminal-browser.com) pane inside Herdr. Plannotator
still owns approvals, feedback, and agent behavior. This plugin only changes
where the page appears.

## Requirements

- Herdr 0.7.5 or newer
- A Plannotator release with external presenter support
- [terminal-browser](https://terminal-browser.com), on `PATH` or in
  `~/.local/bin`
- Bun
- Herdr's experimental Kitty graphics support

If terminal-browser lives somewhere else, set
`HERDR_PLANNOTATOR_TERMINAL_BROWSER_BIN` to its absolute path in the agent's
environment.

Enable graphics in Herdr's configuration:

```toml
[experimental]
kitty_graphics = true
```

Then reload Herdr:

```bash
herdr server reload-config
```

## Install

Install the plugin and connect it to Plannotator:

```bash
herdr plugin install plannotator/herdr-plannotator --yes
herdr plugin action invoke configure --plugin official.plannotator
```

Plugin actions run asynchronously. Repeat the following command until the
latest `configure` record has status `succeeded`; stop and inspect its error if
the status is `failed`:

```bash
herdr plugin log list --plugin official.plannotator --limit 1
```

Then run Doctor and wait for its log record the same way:

```bash
herdr plugin action invoke doctor --plugin official.plannotator
herdr plugin log list --plugin official.plannotator --limit 1
```

Configuration preserves the rest of `~/.plannotator/config.json`. It records
the previous `presenter` value so unconfiguration can restore it. If you change
the presenter yourself afterward, unconfiguration leaves your replacement
alone.

`PLANNOTATOR_PRESENTER`, when present in the agent environment, overrides this
file-based configuration; an empty value disables external presenters. Unset
it or point it at the managed presenter reported by the configure action.

If `PLANNOTATOR_DATA_DIR` is relative, configuration resolves it from the
focused Herdr pane's working directory. Invoke the action with a focused pane,
or use an absolute or `~/...` path.

## How it works

When Plannotator has a page ready, it runs the plugin's presenter helper with
one JSON request. The helper runs `terminal-browser open <url> --split right`
from the agent's pane, reads the new browser's Herdr pane ID from
`terminal-browser ls --json`, and zooms that pane. When the review finishes,
the helper closes the pane, which also closes the browser.

The helper never interprets approval or feedback. The existing Plannotator
server receives those choices directly from its web page.

## Remove the integration

Run unconfigure before uninstalling the plugin:

```bash
herdr plugin action invoke unconfigure --plugin official.plannotator
```

Repeat the log command until the latest `unconfigure` record is `succeeded`.
Do not uninstall while it is `running`, and do not uninstall after a failure:

```bash
herdr plugin log list --plugin official.plannotator --limit 1
```

Only after that record is `succeeded`, uninstall the plugin:

```bash
herdr plugin uninstall official.plannotator
```

## Development

```bash
herdr plugin link /path/to/herdr-plannotator
bun install --cwd /path/to/herdr-plannotator
bun test
bun run typecheck
```
