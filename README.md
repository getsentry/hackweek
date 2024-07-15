# Sentry Hackweek

Welcome to #hackweek!

To get the project running:

```bash
npm install && npm start
```

The Hackweek site uses firebase, so to deploy it you'll need Google credentials.

## Deployment

For dev deployments:

```bash
npm run build && npm run deploy-dev
```

> [!NOTE]
> You don't need to run dev deploys if you don't change the `database.rules.bolt` file.
