import test from "node:test";
import assert from "node:assert/strict";
import { createModerationApi } from "./moderation.mjs";

function createHarness({ actor = { username: "kairo5575" } } = {}) {
    const records = new Map();
    const accounts = [
        { id: "player-1", username: "player" },
        { id: "kairo-id", username: "kairo5575" }
    ];
    const kv = {
        async get(key) {
            const value = records.get(key);
            return value ? JSON.parse(value) : null;
        },
        async put(key, value) {
            records.set(key, value);
        },
        async delete(key) {
            records.delete(key);
        }
    };
    const api = createModerationApi({
        kv,
        authenticate: async () => actor,
        getAccounts: async () => accounts,
        getAccountById: async (id) => accounts.find((account) => account.id === id)
    });
    return { api, records };
}

function post(path, body) {
    return new Request(`https://example.test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

test("mute accepts each custom unit and appears in the account list", async () => {
    const { api } = createHarness();
    const units = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        j: 24 * 60 * 60 * 1000,
        mo: 30 * 24 * 60 * 60 * 1000,
        a: 365 * 24 * 60 * 60 * 1000
    };

    for (const [durationUnit, unitMilliseconds] of Object.entries(units)) {
        const response = await api.handle(post("/moderation/mute", {
            accountId: "player-1",
            durationValue: 2,
            durationUnit
        }));
        const result = await response.json();

        assert.equal(response.status, 200);
        assert.equal(result.moderation.type, "mute");
        assert.equal(result.moderation.durationUnit, durationUnit);
        assert.equal(result.moderation.expiresAt - result.moderation.createdAt, 2 * unitMilliseconds);
    }

    const accountsResponse = await api.handle(new Request("https://example.test/moderation/accounts"));
    const accountsResult = await accountsResponse.json();
    assert.equal(accountsResult.accounts[0].moderation.type, "mute");
});

test("ban is permanent until unban removes it", async () => {
    const { api } = createHarness();
    const banResponse = await api.handle(post("/moderation/ban", { accountId: "player-1" }));
    const banResult = await banResponse.json();

    assert.equal(banResult.moderation.type, "ban");
    assert.equal(banResult.moderation.expiresAt, null);
    assert.equal((await api.getRestriction("player-1")).type, "ban");

    const unbanResponse = await api.handle(post("/moderation/unban", { accountId: "player-1" }));
    assert.equal(unbanResponse.status, 200);
    assert.equal(await api.getRestriction("player-1"), null);
});

test("rejects invalid mute durations and non-moderators", async () => {
    const { api } = createHarness();
    const invalidDuration = await api.handle(post("/moderation/mute", {
        accountId: "player-1",
        durationValue: 1.5,
        durationUnit: "h"
    }));
    assert.equal(invalidDuration.status, 400);

    const invalidUnit = await api.handle(post("/moderation/mute", {
        accountId: "player-1",
        durationValue: 1,
        durationUnit: "week"
    }));
    assert.equal(invalidUnit.status, 400);

    const { api: unprivilegedApi } = createHarness({ actor: { username: "player" } });
    const forbidden = await unprivilegedApi.handle(post("/moderation/ban", { accountId: "player-1" }));
    assert.equal(forbidden.status, 403);
});

test("cannot moderate the moderator account", async () => {
    const { api } = createHarness();
    const response = await api.handle(post("/moderation/ban", { accountId: "kairo-id" }));
    assert.equal(response.status, 400);
});
