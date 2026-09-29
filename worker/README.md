# Worker moderation module

This repository serves a static GitHub Pages site. The live authentication API is a separate Cloudflare Worker, so this module must be imported by that Worker and deployed there before moderation actions become effective.

## KV binding

Create a dedicated Cloudflare KV namespace for moderation data and bind it as `VALDORIAN_MODERATION`. Keep account and session data in the existing namespace. The module stores one record per account under `moderation:account:<encoded-account-id>`.

Add the binding to the Worker configuration:

```toml
[[kv_namespaces]]
binding = "VALDORIAN_MODERATION"
id = "YOUR_KV_NAMESPACE_ID"
```

## Integration

Import the module in the existing Worker entry point. Adapt the three callbacks to the Worker's current session and account storage implementation; never trust an account ID or moderator identity supplied by the browser.

```js
import { createModerationApi, restrictionResponse } from "./moderation.mjs";

const moderation = createModerationApi({
    kv: env.VALDORIAN_MODERATION,
    authenticate: (request) => getUserFromExistingSession(request, env),
    getAccounts: () => listAccountsFromExistingStorage(env),
    getAccountById: (accountId) => getAccountFromExistingStorage(env, accountId)
});

const moderationResponse = await moderation.handle(request);
if (moderationResponse) {
    return addExistingCorsHeaders(moderationResponse);
}
```

Pass the `moderationResponse` check before the existing `/moderation/accounts` route so this module can add restriction state to each account. Preserve the Worker's existing CORS wrapper for every returned response.

After the existing Worker has identified an account, check restrictions before sending a login code, issuing a session, and returning protected profile/session data:

```js
const restriction = await moderation.getRestriction(account.id);
if (restriction) {
    return addExistingCorsHeaders(restrictionResponse(restriction));
}
```

Apply the check to both `/send-code` and `/verify-code` before sending a code or creating a session. Also apply it to authenticated routes such as `/profile`; when a restriction is found, invalidate that account's active session using the existing session store before returning the 403. This makes bans effective for existing sessions as well as future logins. A mute expires automatically when its timestamp passes; a ban has no expiry and remains until `/moderation/unban` removes it.

The moderation page calls these routes:

- `GET /moderation/accounts`
- `POST /moderation/mute` with `{ "accountId": "...", "durationValue": 2, "durationUnit": "h" }`
- `POST /moderation/ban` with `{ "accountId": "..." }`
- `POST /moderation/unban` with `{ "accountId": "..." }`

Mute duration is entered as an integer from 1 to 9999 with a unit: `m` (minute), `h` (hour), `j` (day), `mo` (30-day month), or `a` (365-day year). Only the authenticated `kairo5575` account can moderate, and the moderator account cannot be sanctioned.

## Test

Run the module tests locally with:

```sh
node --test worker/moderation.test.mjs
```
