const MUTE_DURATIONS = new Set([5, 10, 30, 60, 1440]);
const MODERATION_PREFIX = "moderation:account:";

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}

function moderationKey(accountId) {
    return `${MODERATION_PREFIX}${encodeURIComponent(String(accountId))}`;
}

export function restrictionResponse(restriction) {
    const message = restriction.type === "ban"
        ? "Ce compte est banni définitivement."
        : "Ce compte est temporairement bloqué.";

    return jsonResponse({
        success: false,
        error: message,
        moderation: restriction
    }, 403);
}

export function createModerationApi({
    kv,
    authenticate,
    getAccounts,
    getAccountById,
    moderatorUsername = "kairo5575"
}) {
    if (!kv || typeof authenticate !== "function" || typeof getAccounts !== "function" || typeof getAccountById !== "function") {
        throw new TypeError("KV and account/authentication adapters are required.");
    }

    async function getRestriction(accountId) {
        if (!accountId) {
            return null;
        }

        const restriction = await kv.get(moderationKey(accountId), "json");
        if (!restriction) {
            return null;
        }

        if (restriction.type === "mute" && restriction.expiresAt <= Date.now()) {
            await kv.delete(moderationKey(accountId));
            return null;
        }

        return restriction;
    }

    async function handle(request) {
        const url = new URL(request.url);
        const routeMatch = url.pathname.match(/^\/moderation\/(mute|ban|unban)$/);
        if (!routeMatch && url.pathname !== "/moderation/accounts") {
            return null;
        }

        const actor = await authenticate(request);
        if (!actor) {
            return jsonResponse({ success: false, error: "Session invalide ou expirée." }, 401);
        }
        if (actor.username !== moderatorUsername) {
            return jsonResponse({ success: false, error: "Accès refusé." }, 403);
        }

        if (url.pathname === "/moderation/accounts" && request.method === "GET") {
            const accounts = await getAccounts();
            const accountsWithModeration = await Promise.all(accounts.map(async (account) => ({
                ...account,
                moderation: await getRestriction(account.id)
            })));
            return jsonResponse({ success: true, accounts: accountsWithModeration });
        }

        if (!routeMatch || request.method !== "POST") {
            return jsonResponse({ success: false, error: "Méthode non autorisée." }, 405);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ success: false, error: "Corps JSON invalide." }, 400);
        }

        const accountId = body.accountId === undefined || body.accountId === null
            ? ""
            : String(body.accountId).trim();
        if (!accountId) {
            return jsonResponse({ success: false, error: "ID de compte requis." }, 400);
        }

        const account = await getAccountById(accountId);
        if (!account) {
            return jsonResponse({ success: false, error: "Compte introuvable." }, 404);
        }
        if (account.username === moderatorUsername) {
            return jsonResponse({ success: false, error: "Le compte modérateur ne peut pas être sanctionné." }, 400);
        }

        const action = routeMatch[1];
        if (action === "unban") {
            const current = await getRestriction(accountId);
            if (!current || current.type !== "ban") {
                return jsonResponse({ success: false, error: "Ce compte n’est pas banni." }, 409);
            }
            await kv.delete(moderationKey(accountId));
            return jsonResponse({ success: true, moderation: null });
        }

        let restriction;
        if (action === "mute") {
            const durationMinutes = Number(body.durationMinutes);
            if (!MUTE_DURATIONS.has(durationMinutes)) {
                return jsonResponse({ success: false, error: "Durée de mute invalide." }, 400);
            }
            const now = Date.now();
            restriction = {
                type: "mute",
                createdAt: now,
                expiresAt: now + durationMinutes * 60 * 1000,
                moderator: actor.username
            };
        } else {
            restriction = {
                type: "ban",
                createdAt: Date.now(),
                expiresAt: null,
                moderator: actor.username
            };
        }

        await kv.put(moderationKey(accountId), JSON.stringify(restriction));
        return jsonResponse({ success: true, moderation: restriction });
    }

    return { handle, getRestriction };
}
