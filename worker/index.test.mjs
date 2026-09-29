import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

function createEnvironment() {
    const values = new Map([
        ["user:moderator-id", JSON.stringify({ id: "moderator-id", username: "kairo5575", email: "mod@example.com" })],
        ["user:player-id", JSON.stringify({ id: "player-id", username: "player", email: "player@example.com" })],
        ["session:moderator-token", JSON.stringify({ userId: "moderator-id" })],
        ["session:player-token", JSON.stringify({ userId: "player-id" })]
    ]);

    return {
        values,
        VALDORIAN_KV: {
            async get(key, type) {
                const value = values.get(key);
                if (value === undefined) {
                    return null;
                }
                return type === "json" ? JSON.parse(value) : value;
            },
            async put(key, value) {
                values.set(key, value);
            },
            async delete(key) {
                values.delete(key);
            },
            async list({ prefix }) {
                return {
                    keys: [...values.keys()]
                        .filter((key) => key.startsWith(prefix))
                        .map((name) => ({ name })),
                    list_complete: true
                };
            }
        }
    };
}

function authorizedRequest(path, token, method = "GET", body = undefined) {
    return new Request(`https://worker.test${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}

test("the complete Worker stores a custom mute and blocks the active session", async () => {
    const env = createEnvironment();
    const muteResponse = await worker.fetch(authorizedRequest("/moderation/mute", "moderator-token", "POST", {
        accountId: "player-id",
        durationValue: 2,
        durationUnit: "mo"
    }), env);
    const muteResult = await muteResponse.json();

    assert.equal(muteResponse.status, 200);
    assert.equal(muteResult.moderation.durationUnit, "mo");
    assert.equal(muteResult.moderation.expiresAt - muteResult.moderation.createdAt, 60 * 24 * 60 * 60 * 1000);

    const profileResponse = await worker.fetch(authorizedRequest("/profile", "player-token"), env);
    const profileResult = await profileResponse.json();
    assert.equal(profileResponse.status, 403);
    assert.equal(profileResult.moderation.type, "mute");
    assert.equal(env.values.has("session:player-token"), false);
});

test("the complete Worker lists restriction status and allows ban removal", async () => {
    const env = createEnvironment();
    const banResponse = await worker.fetch(authorizedRequest("/moderation/ban", "moderator-token", "POST", {
        accountId: "player-id"
    }), env);
    assert.equal(banResponse.status, 200);

    const listResponse = await worker.fetch(authorizedRequest("/moderation/accounts", "moderator-token"), env);
    const listResult = await listResponse.json();
    const player = listResult.accounts.find((account) => account.id === "player-id");
    assert.equal(player.moderation.type, "ban");

    const unbanResponse = await worker.fetch(authorizedRequest("/moderation/unban", "moderator-token", "POST", {
        accountId: "player-id"
    }), env);
    assert.equal(unbanResponse.status, 200);
    assert.equal((await unbanResponse.json()).moderation, null);
});

test("the complete Worker rejects moderation by a non-moderator", async () => {
    const env = createEnvironment();
    const response = await worker.fetch(authorizedRequest("/moderation/ban", "player-token", "POST", {
        accountId: "moderator-id"
    }), env);
    assert.equal(response.status, 403);
});
