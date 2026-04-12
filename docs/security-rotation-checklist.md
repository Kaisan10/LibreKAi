# Security Rotation Checklist

If secrets were exposed in local files or logs, rotate these keys immediately:

- `SESSION_SECRET`
- `WEBHOOK_TOKEN`
- `POINTS_API_KEY`
- `SHORT_URL_API_KEY`
- `DISCOURSE_SECRET`
- Any embedded site keys previously issued for `/api/embedded/ask`
- Any API keys created under `/api/user/api-key/create`
- Any scratch/dev keys in `scripts/scratch/.env`

After rotation:

1. Update secure secret storage (environment or secrets manager).
2. Restart the server.
3. Verify `npm run start` boots without security warnings.
4. Re-issue embedded widget snippets with `data-api-key`.
