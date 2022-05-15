# Kaban

This is a small telegram bot for public channel post comments moderation.
It uses Heroku for hosting.

## Installation

### Env

Bot uses env variables, it should be setted before installation:

- `TELEGRAM` - telegram bot token
- `CHANNEL` - public channel id
- `CHAT` - chat, assigned to channel for discussions
- `ADMINS` - array of ids for additional admins (as json string)
- `DEBUG` - output debug info, if defined

### Setup

To download and install all dependencies:

```
yarn
```

To build:

```
yarn build
```

## Deployment

Repo has github workflow to auto-deployment bot to Heroku. It requires configured repo secrets: `HEROKU_API_KEY`, `HEROKU_APP_NAME`, `HEROKU_EMAIL`
