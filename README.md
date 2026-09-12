# Prediction Markets for Gloom

Polymarket and Kalshi event markets in one table: price, spread, 24h volume, liquidity, and close date, filtered by venue and category. Open a market for its order book, recent trades, outcome breakdown, price history, and resolution rules.

## Install

Requires Gloom 0.15.0 or newer. Gloom restores this plugin once for existing installations when it moves out of the core app: saved panes keep working because the pane and template ids are unchanged, a previously disabled plugin stays disabled, and a deliberate removal is respected.

```sh
gloomberb install gloom-sh/gloom-prediction-markets
```

Open `PM` in the command bar, or `PM <query>` to land on a search. `PM polymarket:fed` scopes the search to one venue.

## Usage

The browse tabs are top, ending soon, new, and watchlist; `h`/`l` or the arrow keys switch venue scope and category. Type to search; the arrow keys move between the search field and the table. Select a market for its detail stack: overview, order book, trades, outcomes, and rules. Polymarket books and trades update live over its websocket while a market is open; Kalshi is polled. `o` opens the market on its venue, `r` refreshes.

`gloomberb predictions [venue] [category] [tab] [search...]` launches the app straight into the pane, for example `gloomberb predictions polymarket world ending iran`. `gloomberb fn prediction-markets` returns the same model headlessly.

The plugin also registers a `prediction-markets.series` chart-series capability, so a market's price history can be plotted in the chart composer next to anything else Gloom charts.

## Data

Polymarket's public Gamma, CLOB, and data APIs, and Kalshi's public trade API. Unofficial and unauthenticated; if either venue changes its shape the pane breaks until this plugin is updated, which is one reason it is a plugin rather than part of the core app. Nothing goes through Gloom Cloud. Responses are cached in plugin persistence so the pane has something to show before the first fetch.

## Development

```sh
bun install
# Link a Gloom checkout, as the plugin installer does:
ln -s /path/to/gloomberb node_modules/gloomberb
ln -s /path/to/gloomberb/node_modules/react node_modules/react
bun run typecheck
bun test
```

`gloomberb` and `react` are peer dependencies, never real ones. Gloom symlinks its own copies into every plugin directory on install and on load, so there is exactly one instance of each in the process. CI links the host the same way.

## License

MIT
