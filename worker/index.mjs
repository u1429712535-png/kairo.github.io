// =====================================================
// VALDORIAN - WORKER DE VERIFICATION ET DE MODERATION
// Cloudflare Workers + KV + Brevo
// Remplace le fichier principal du Worker par ce fichier.
// Bindings requis : VALDORIAN_KV, BREVO_API_KEY
// =====================================================

const allowedOrigins = [
    "https://u1429712535-png.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
];

const CODE_TTL = 10 * 60;
const RESEND_TTL = 60;
const SESSION_TTL = 30 * 24 * 60 * 60;
const MAX_AVATAR_SIZE = 700000;
const MODERATOR_USERNAME = "kairo5575";
const MODERATION_PREFIX = "moderation:account:";
const MUTE_UNITS = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    j: 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
    a: 365 * 24 * 60 * 60 * 1000
};


// =====================================================
// OUTILS
// =====================================================

function getCorsHeaders(request) {
    const origin = request.headers.get("Origin");
    return {
        "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
            ? origin
            : "https://u1429712535-png.github.io",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
    };
}

function jsonResponse(request, data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...getCorsHeaders(request)
        }
    });
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeUsername(username) {
    return String(username || "").trim();
}

function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validUsername(username) {
    return /^[a-zA-Z0-9_.-]{3,20}$/.test(username);
}

function randomCode() {
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    return String(100000 + (bytes[0] % 900000));
}

function randomToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}


// =====================================================
// MOT DE PASSE
// =====================================================

async function hashPassword(password, saltBase64 = null) {
    const encoder = new TextEncoder();
    const salt = saltBase64
        ? base64ToBytes(saltBase64)
        : crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
    }, keyMaterial, 256);
    return {
        hash: bytesToBase64(new Uint8Array(derivedBits)),
        salt: bytesToBase64(salt)
    };
}

async function verifyPassword(password, storedHash, storedSalt) {
    const result = await hashPassword(password, storedSalt);
    return result.hash === storedHash;
}


// =====================================================
// SESSION
// =====================================================

function getSessionToken(request) {
    const authorization = request.headers.get("Authorization");
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }
    return authorization.slice(7).trim();
}

async function getSession(request, env) {
    const token = getSessionToken(request);
    if (!token) {
        return null;
    }
    return env.VALDORIAN_KV.get(`session:${token}`, "json");
}

async function getSessionUser(request, env) {
    const session = await getSession(request, env);
    if (!session) {
        return null;
    }
    const user = await env.VALDORIAN_KV.get(`user:${session.userId}`, "json");
    return user ? { session, user } : null;
}


// =====================================================
// MODERATION
// =====================================================

function moderationKey(accountId) {
    return `${MODERATION_PREFIX}${encodeURIComponent(String(accountId))}`;
}

async function getModeration(accountId, env) {
    const key = moderationKey(accountId);
    const restriction = await env.VALDORIAN_KV.get(key, "json");
    if (!restriction) {
        return null;
    }
    if (restriction.type === "mute" && restriction.expiresAt <= Date.now()) {
        await env.VALDORIAN_KV.delete(key);
        return null;
    }
    return restriction;
}

function moderationBlockedResponse(request, restriction) {
    return jsonResponse(request, {
        success: false,
        error: restriction.type === "ban"
            ? "Ce compte est banni définitivement."
            : "Ce compte est temporairement bloqué.",
        moderation: restriction
    }, 403);
}

async function enforceModeration(request, env, user, sessionToken = null) {
    const restriction = await getModeration(user.id, env);
    if (!restriction) {
        return null;
    }
    if (sessionToken) {
        await env.VALDORIAN_KV.delete(`session:${sessionToken}`);
    }
    return moderationBlockedResponse(request, restriction);
}

async function handleModerationRoute(request, env, pathname) {
    const isAccountList = pathname === "/moderation/accounts";
    const actionMatch = pathname.match(/^\/moderation\/(mute|ban|unban)$/);
    if (!isAccountList && !actionMatch) {
        return null;
    }

    const authenticated = await getSessionUser(request, env);
    if (!authenticated) {
        return jsonResponse(request, {
            success: false,
            error: "Session invalide ou expirée."
        }, 401);
    }

    const moderator = authenticated.user;
    if (moderator.username !== MODERATOR_USERNAME) {
        return jsonResponse(request, { success: false, error: "Accès refusé." }, 403);
    }

    if (isAccountList && request.method === "GET") {
        const accounts = [];
        let cursor;
        while (true) {
            const options = { prefix: "user:", limit: 100 };
            if (cursor) {
                options.cursor = cursor;
            }
            const page = await env.VALDORIAN_KV.list(options);
            const pageAccounts = await Promise.all(page.keys.map(async key => {
                const user = await env.VALDORIAN_KV.get(key.name, "json");
                if (!user) {
                    return null;
                }
                return {
                    ...publicUser(user),
                    moderation: await getModeration(user.id, env)
                };
            }));
            accounts.push(...pageAccounts.filter(Boolean));
            if (page.list_complete || !page.cursor) {
                break;
            }
            cursor = page.cursor;
        }
        return jsonResponse(request, { success: true, accounts });
    }

    if (!actionMatch || request.method !== "POST") {
        return jsonResponse(request, { success: false, error: "Méthode non autorisée." }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse(request, { success: false, error: "Corps JSON invalide." }, 400);
    }

    const accountId = body.accountId === undefined || body.accountId === null
        ? ""
        : String(body.accountId).trim();
    if (!accountId) {
        return jsonResponse(request, { success: false, error: "ID de compte requis." }, 400);
    }

    const account = await env.VALDORIAN_KV.get(`user:${accountId}`, "json");
    if (!account) {
        return jsonResponse(request, { success: false, error: "Compte introuvable." }, 404);
    }
    if (account.username === MODERATOR_USERNAME) {
        return jsonResponse(request, {
            success: false,
            error: "Le compte modérateur ne peut pas être sanctionné."
        }, 400);
    }

    const action = actionMatch[1];
    const key = moderationKey(accountId);
    if (action === "unban") {
        const restriction = await getModeration(accountId, env);
        if (!restriction || restriction.type !== "ban") {
            return jsonResponse(request, { success: false, error: "Ce compte n’est pas banni." }, 409);
        }
        await env.VALDORIAN_KV.delete(key);
        return jsonResponse(request, { success: true, moderation: null });
    }

    let restriction;
    if (action === "mute") {
        const durationValue = Number(body.durationValue);
        const durationUnit = body.durationUnit;
        const unitMilliseconds = MUTE_UNITS[durationUnit];
        const durationMilliseconds = durationValue * unitMilliseconds;
        if (
            !Number.isInteger(durationValue) ||
            durationValue < 1 ||
            durationValue > 9999 ||
            !unitMilliseconds ||
            !Number.isSafeInteger(durationMilliseconds)
        ) {
            return jsonResponse(request, {
                success: false,
                error: "Durée invalide. Utilise un nombre entier de 1 à 9999 et une unité m, h, j, mo ou a."
            }, 400);
        }
        const now = Date.now();
        restriction = {
            type: "mute",
            createdAt: now,
            expiresAt: now + durationMilliseconds,
            durationValue,
            durationUnit,
            moderator: moderator.username
        };
    } else {
        restriction = {
            type: "ban",
            createdAt: Date.now(),
            expiresAt: null,
            moderator: moderator.username
        };
    }

    await env.VALDORIAN_KV.put(key, JSON.stringify(restriction));
    return jsonResponse(request, { success: true, moderation: restriction });
}


// =====================================================
// UTILISATEUR PUBLIC
// =====================================================

function publicUser(user) {
    return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName || "",
        avatar: user.avatar || "",
        createdAt: user.createdAt
    };
}


// =====================================================
// BREVO
// =====================================================

async function sendVerificationEmail(env, email, code) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": env.BREVO_API_KEY
        },
        body: JSON.stringify({
            sender: { name: "Valdorian", email: "gorolo91@outlook.fr" },
            to: [{ email }],
            subject: "Votre code de vérification Valdorian",
            htmlContent: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>body{margin:0;padding:0;background:#0b0b0f;color:#fff;font-family:Arial,sans-serif}.container{max-width:600px;margin:40px auto;background:#15151c;border:1px solid #2a2a35;border-radius:14px;padding:35px;text-align:center}.logo{font-size:30px;font-weight:bold;letter-spacing:5px}.title{font-size:24px;margin-top:30px}.text{color:#bdbdc8;line-height:1.6}.code{display:inline-block;margin:25px 0;padding:18px 30px;background:#20202a;border:1px solid #3a3a48;border-radius:10px;font-size:32px;font-weight:bold;letter-spacing:8px}.footer{margin-top:30px;font-size:12px;color:#777784}</style></head><body><div class="container"><div class="logo">VALDORIAN</div><div class="title">Vérification de votre compte</div><p class="text">Utilisez le code ci-dessous pour vérifier votre adresse e-mail.</p><div class="code">${code}</div><p class="text">Ce code est valable pendant 10 minutes.</p><div class="footer">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.</div></div></body></html>`
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur Brevo :", errorText);
        throw new Error("Impossible d'envoyer l'e-mail.");
    }
    return true;
}


// =====================================================
// ROUTES
// =====================================================

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: getCorsHeaders(request) });
        }

        const { pathname } = new URL(request.url);

        if (request.method === "GET" && pathname === "/") {
            return jsonResponse(request, {
                success: true,
                message: "Worker Valdorian opérationnel.",
                kv: !!env.VALDORIAN_KV,
                brevo: !!env.BREVO_API_KEY
            });
        }

        if (request.method === "POST" && pathname === "/send-code") {
            try {
                const body = await request.json();
                const email = normalizeEmail(body.email);
                const password = String(body.password || "");
                if (!validEmail(email)) {
                    return jsonResponse(request, { success: false, error: "Adresse e-mail invalide." }, 400);
                }
                if (password.length < 6) {
                    return jsonResponse(request, { success: false, error: "Le mot de passe doit contenir au moins 6 caractères." }, 400);
                }

                const emailId = await sha256(email);
                const resendCooldown = await env.VALDORIAN_KV.get(`resend:${emailId}`);
                if (resendCooldown) {
                    return jsonResponse(request, { success: false, error: "Veuillez attendre avant de demander un nouveau code." }, 429);
                }

                const existingUser = await env.VALDORIAN_KV.get(`user:${emailId}`, "json");
                if (existingUser) {
                    const passwordCorrect = await verifyPassword(password, existingUser.passwordHash, existingUser.passwordSalt);
                    if (!passwordCorrect) {
                        return jsonResponse(request, { success: false, error: "Mot de passe incorrect." }, 401);
                    }
                    const restriction = await getModeration(existingUser.id, env);
                    if (restriction) {
                        return moderationBlockedResponse(request, restriction);
                    }
                }

                const code = randomCode();
                const passwordData = await hashPassword(password);
                await env.VALDORIAN_KV.put(`code:${emailId}`, JSON.stringify({
                    email,
                    code,
                    passwordHash: passwordData.hash,
                    passwordSalt: passwordData.salt,
                    createdAt: Date.now()
                }), { expirationTtl: CODE_TTL });

                await sendVerificationEmail(env, email, code);
                await env.VALDORIAN_KV.put(`resend:${emailId}`, "1", { expirationTtl: RESEND_TTL });
                return jsonResponse(request, { success: true, message: "Code envoyé." });
            } catch (error) {
                console.error("Erreur /send-code :", error);
                return jsonResponse(request, { success: false, error: "Une erreur est survenue lors de l'envoi du code." }, 500);
            }
        }

        if (request.method === "POST" && pathname === "/resend-code") {
            try {
                const body = await request.json();
                const email = normalizeEmail(body.email);
                if (!validEmail(email)) {
                    return jsonResponse(request, { success: false, error: "Adresse e-mail invalide." }, 400);
                }
                const emailId = await sha256(email);
                const existingUser = await env.VALDORIAN_KV.get(`user:${emailId}`, "json");
                if (existingUser) {
                    const restriction = await getModeration(existingUser.id, env);
                    if (restriction) {
                        return moderationBlockedResponse(request, restriction);
                    }
                }

                const cooldown = await env.VALDORIAN_KV.get(`resend:${emailId}`);
                if (cooldown) {
                    return jsonResponse(request, { success: false, error: "Veuillez attendre 60 secondes avant de renvoyer un code." }, 429);
                }
                const codeData = await env.VALDORIAN_KV.get(`code:${emailId}`, "json");
                if (!codeData) {
                    return jsonResponse(request, { success: false, error: "Aucun code actif. Recommencez la connexion." }, 400);
                }

                const newCode = randomCode();
                await env.VALDORIAN_KV.put(`code:${emailId}`, JSON.stringify({
                    email,
                    code: newCode,
                    passwordHash: codeData.passwordHash,
                    passwordSalt: codeData.passwordSalt,
                    createdAt: Date.now()
                }), { expirationTtl: CODE_TTL });
                await sendVerificationEmail(env, email, newCode);
                await env.VALDORIAN_KV.put(`resend:${emailId}`, "1", { expirationTtl: RESEND_TTL });
                return jsonResponse(request, { success: true, message: "Nouveau code envoyé." });
            } catch (error) {
                console.error("Erreur /resend-code :", error);
                return jsonResponse(request, { success: false, error: "Impossible de renvoyer le code." }, 500);
            }
        }

        if (request.method === "POST" && pathname === "/verify-code") {
            try {
                const body = await request.json();
                const email = normalizeEmail(body.email);
                const code = String(body.code || "").trim();
                if (!validEmail(email)) {
                    return jsonResponse(request, { success: false, error: "Adresse e-mail invalide." }, 400);
                }
                if (!/^\d{6}$/.test(code)) {
                    return jsonResponse(request, { success: false, error: "Code invalide." }, 400);
                }

                const emailId = await sha256(email);
                const codeData = await env.VALDORIAN_KV.get(`code:${emailId}`, "json");
                if (!codeData) {
                    return jsonResponse(request, { success: false, error: "Le code a expiré ou n'existe plus." }, 400);
                }
                if (codeData.code !== code) {
                    return jsonResponse(request, { success: false, error: "Code incorrect." }, 401);
                }

                let user = await env.VALDORIAN_KV.get(`user:${emailId}`, "json");
                if (user) {
                    const restriction = await getModeration(user.id, env);
                    if (restriction) {
                        return moderationBlockedResponse(request, restriction);
                    }
                } else {
                    const defaultUsername = `user${Date.now().toString().slice(-6)}`;
                    user = {
                        id: emailId,
                        email,
                        username: defaultUsername,
                        displayName: "",
                        avatar: "",
                        passwordHash: codeData.passwordHash,
                        passwordSalt: codeData.passwordSalt,
                        createdAt: new Date().toISOString()
                    };
                    await env.VALDORIAN_KV.put(`username:${defaultUsername.toLowerCase()}`, emailId);
                    await env.VALDORIAN_KV.put(`user:${emailId}`, JSON.stringify(user));
                }

                const sessionToken = randomToken();
                await env.VALDORIAN_KV.put(`session:${sessionToken}`, JSON.stringify({
                    userId: user.id,
                    email: user.email,
                    createdAt: Date.now()
                }), { expirationTtl: SESSION_TTL });
                await env.VALDORIAN_KV.delete(`code:${emailId}`);
                await env.VALDORIAN_KV.delete(`resend:${emailId}`);
                return jsonResponse(request, {
                    success: true,
                    message: "Connexion réussie.",
                    token: sessionToken,
                    user: publicUser(user)
                });
            } catch (error) {
                console.error("Erreur /verify-code :", error);
                return jsonResponse(request, { success: false, error: "Impossible de vérifier le code." }, 500);
            }
        }

        const moderationResponse = await handleModerationRoute(request, env, pathname);
        if (moderationResponse) {
            return moderationResponse;
        }

        if (request.method === "GET" && pathname === "/profile") {
            try {
                const authenticated = await getSessionUser(request, env);
                if (!authenticated) {
                    return jsonResponse(request, { success: false, error: "Session invalide ou expirée." }, 401);
                }
                const restrictionResponse = await enforceModeration(
                    request,
                    env,
                    authenticated.user,
                    getSessionToken(request)
                );
                if (restrictionResponse) {
                    return restrictionResponse;
                }
                return jsonResponse(request, { success: true, user: publicUser(authenticated.user) });
            } catch (error) {
                console.error("Erreur /profile GET :", error);
                return jsonResponse(request, { success: false, error: "Impossible de récupérer le profil." }, 500);
            }
        }

        if ((request.method === "GET" || request.method === "POST") && pathname === "/save") {
            try {
                const authenticated = await getSessionUser(request, env);
                if (!authenticated) {
                    return jsonResponse(request, { success: false, error: "Session invalide ou expirée." }, 401);
                }
                const restrictionResponse = await enforceModeration(
                    request,
                    env,
                    authenticated.user,
                    getSessionToken(request)
                );
                if (restrictionResponse) {
                    return restrictionResponse;
                }

                const saveKey = `save:${encodeURIComponent(authenticated.user.id)}`;
                if (request.method === "GET") {
                    const save = await env.VALDORIAN_KV.get(saveKey, "json");
                    return jsonResponse(request, { success: true, save });
                }

                const body = await request.json().catch(() => null);
                const progress = body?.progress;
                if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
                    return jsonResponse(request, { success: false, error: "Données de sauvegarde invalides." }, 400);
                }
                if (new TextEncoder().encode(JSON.stringify(progress)).byteLength > 32_768) {
                    return jsonResponse(request, { success: false, error: "La sauvegarde est trop volumineuse." }, 413);
                }

                const save = {
                    savedAt: Date.now(),
                    progress
                };
                await env.VALDORIAN_KV.put(saveKey, JSON.stringify(save));
                return jsonResponse(request, { success: true, save });
            } catch (error) {
                console.error("Erreur /save :", error);
                return jsonResponse(request, { success: false, error: "Impossible d’enregistrer la progression." }, 500);
            }
        }

        if (request.method === "POST" && pathname === "/username-available") {
            try {
                const body = await request.json();
                const username = normalizeUsername(body.username);
                if (!validUsername(username)) {
                    return jsonResponse(request, {
                        success: false,
                        available: false,
                        error: "Nom d'utilisateur invalide."
                    }, 400);
                }
                const existing = await env.VALDORIAN_KV.get(`username:${username.toLowerCase()}`);
                return jsonResponse(request, { success: true, available: !existing });
            } catch (error) {
                console.error("Erreur /username-available :", error);
                return jsonResponse(request, { success: false, error: "Impossible de vérifier le nom d'utilisateur." }, 500);
            }
        }

        if (request.method === "POST" && pathname === "/profile") {
            try {
                const authenticated = await getSessionUser(request, env);
                if (!authenticated) {
                    return jsonResponse(request, { success: false, error: "Session invalide ou expirée." }, 401);
                }
                const restrictionResponse = await enforceModeration(
                    request,
                    env,
                    authenticated.user,
                    getSessionToken(request)
                );
                if (restrictionResponse) {
                    return restrictionResponse;
                }

                const body = await request.json();
                const user = authenticated.user;
                if (body.displayName !== undefined) {
                    const displayName = String(body.displayName || "").trim();
                    if (displayName.length > 30) {
                        return jsonResponse(request, { success: false, error: "Le nom affiché est trop long." }, 400);
                    }
                    user.displayName = displayName;
                }

                if (body.username !== undefined) {
                    const newUsername = normalizeUsername(body.username);
                    if (!validUsername(newUsername)) {
                        return jsonResponse(request, { success: false, error: "Nom d'utilisateur invalide." }, 400);
                    }
                    const oldUsername = user.username;
                    if (newUsername.toLowerCase() !== oldUsername.toLowerCase()) {
                        const usernameKey = newUsername.toLowerCase();
                        const existing = await env.VALDORIAN_KV.get(`username:${usernameKey}`);
                        if (existing && existing !== user.id) {
                            return jsonResponse(request, { success: false, error: "Ce nom d'utilisateur est déjà utilisé." }, 409);
                        }
                        await env.VALDORIAN_KV.delete(`username:${oldUsername.toLowerCase()}`);
                        await env.VALDORIAN_KV.put(`username:${usernameKey}`, user.id);
                        user.username = newUsername;
                    }
                }

                if (body.avatar !== undefined) {
                    const avatar = String(body.avatar || "");
                    if (avatar.length > MAX_AVATAR_SIZE) {
                        return jsonResponse(request, { success: false, error: "L'image est trop volumineuse." }, 400);
                    }
                    user.avatar = avatar;
                }

                await env.VALDORIAN_KV.put(`user:${user.id}`, JSON.stringify(user));
                return jsonResponse(request, { success: true, user: publicUser(user) });
            } catch (error) {
                console.error("Erreur /profile POST :", error);
                return jsonResponse(request, { success: false, error: "Impossible de modifier le profil." }, 500);
            }
        }

        if (request.method === "POST" && pathname === "/logout") {
            try {
                const token = getSessionToken(request);
                if (token) {
                    await env.VALDORIAN_KV.delete(`session:${token}`);
                }
                return jsonResponse(request, { success: true, message: "Déconnexion réussie." });
            } catch (error) {
                console.error("Erreur /logout :", error);
                return jsonResponse(request, { success: false, error: "Impossible de se déconnecter." }, 500);
            }
        }

        return jsonResponse(request, { success: false, error: "Route introuvable." }, 404);
    }
};
