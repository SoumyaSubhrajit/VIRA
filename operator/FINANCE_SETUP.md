# Personal finance controls

Open `/finance`. Review each transaction to confirm a category and optionally record why it happened. Merchant rules apply to exact normalized names on unreviewed past/future payments; explicitly reviewed transactions take priority. Mixed merchants may need individual review. The app cannot infer purchase contents from a payment name alone.

Set a daily **outflow** limit and daily Gmail time (Asia/Kolkata). Default time is 21:00; limit is unset until you choose one. Daily emails are enabled and target soumyasubhrajit@gmail.com through the existing connected Gmail account. Both Next.js and `npm run scheduler` must remain running. This is not an always-on hosted service. Delivery status appears on the page. A delivery attempt is claimed once per local day; failed/uncertain attempts are not automatically retried to avoid duplicate mail. Check Gmail and logs before any manual retry.

Current records come from imported statements/email alerts, not live Google Pay or bank access. Missing records do not mean zero spending. Transfers are included in outflow and incoming transfers are not necessarily income.

## Optional OpenAI reports

Configure `OPENAI_API_KEY` and `OPENAI_FINANCE_MODEL` in the server's ignored `.env.local`, using a Responses API-compatible model available to your API project, then restart the server. API billing is separate from a ChatGPT subscription. Never commit credentials.

For Android capture, generate a separate token with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`, save it as `VIRA_DEVICE_TOKEN` in `.env.local`, and enter the same token in VIRA Capture. The device endpoint accepts only that bearer token and saves normalized amount, direction, merchant, timestamp and `device` source; it does not accept full notification text.

Press Generate monthly AI report to explicitly send only amounts, direction, categories, category sources and your purpose notes to the OpenAI Responses API (`store: false`). No PDF, account details or UPI references are included. Do not put secrets in purpose notes. Reports are persisted locally, are not guaranteed accurate, and should be regenerated after changes. No automatic AI calls run in the background.

## Verification

`node tests/finance-control.cjs` uses an isolated temporary SQLite database and mocked email delivery. `npm run build` checks application compilation and types.

## Deployment boundary

This remains a single-user local app, not a production multi-user product. Before internet hosting, add authentication, per-user authorization and data isolation, encrypted backups, retention/deletion controls, rate limiting, robust import reconciliation, and managed background jobs. Do not expose the local server publicly.
