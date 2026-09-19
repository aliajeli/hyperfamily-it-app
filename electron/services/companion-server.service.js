'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Companion HTTP server — lets the HyperFamily Companion app on Android use
 * this workstation as its backend. The phone never touches the store network
 * itself: it loads the same interface this app serves from out/ and talks to
 * the small /api surface below, which reads the very same database, monitor
 * snapshot and login the desktop app uses.
 *
 * Security model (LAN MVP): every /api route except health requires the
 * companion token (Authorization: Bearer …) shown in Settings, and signing in
 * still requires a real application account. The token can be rotated at any
 * time. Serving plain HTTP on the store LAN is a deliberate trade-off; a TLS
 * option can be layered on later without touching the API shape.
 *
 * The service is dependency-injected (database, exportRoot, appVersion) so it
 * is unit-testable in plain Node, without Electron.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain',
    '.map': 'application/json',
    '.webmanifest': 'application/manifest+json'
};
/*
 * CORS for the companion app. The phone's connect screen runs on the
 * Capacitor origin (https://localhost) and pre-checks reachability with a
 * cross-origin GET /api/health before navigating — without these headers the
 * WebView discards the response and the server looks unreachable even when
 * it answers. `*` is safe here: every non-health route still requires the
 * companion token, and the server only exists on the store LAN.
 */
const CORS_HEADERS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type'
};
const BRIDGE_FILE = path.join(__dirname, 'companion-bridge.txt');
const DEFAULT_PORT = 8420;
function newToken() {
    return crypto.randomBytes(24).toString('base64url');
}
/** Every non-internal IPv4 address — the candidates the phone can reach. */
function lanAddresses() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address);
}
function createCompanionServer({ database, exportRoot, appVersion, terminal = null, storeUpdateService = null, storeInstallService = null }) {
    /* Live terminal sessions for the phone (v3.10.0). The terminal service
     * streams its output to a WebContents "sender"; the phone has none, so it
     * gets a synthetic sender whose send() feeds this ring buffer, and the
     * bridge drains it by polling /api/terminal/events. */
    const terminalEvents = [];
    let terminalSeq = 0;
    const companionSender = {
        id: 'companion',
        isDestroyed: () => false,
        send: (channel, payload) => {
            terminalSeq += 1;
            terminalEvents.push({ seq: terminalSeq, channel, payload });
            if (terminalEvents.length > 2000)
                terminalEvents.splice(0, terminalEvents.length - 2000);
        }
    };

    // Store-update events for phone (v3.10.2): version, step, progress, agentStep, installStep, finished, installFinished
    const storeUpdateEvents = [];
    let storeUpdateSeq = 0;
    const pushStoreUpdateEvent = (channel, payload) => {
        storeUpdateSeq += 1;
        storeUpdateEvents.push({ seq: storeUpdateSeq, channel, payload });
        if (storeUpdateEvents.length > 4000) storeUpdateEvents.splice(0, storeUpdateEvents.length - 4000);
    };

    // Wrap store services sendEvent to also push to companion buffer
    if (storeUpdateService) {
        const origSend = storeUpdateService.sendEvent?.bind(storeUpdateService) || storeUpdateService.sendEvent;
        const origEmit = storeUpdateService.emit?.bind(storeUpdateService);
        const combined = (channel, payload) => {
            try {
                if (origSend) origSend(channel, payload);
                else if (origEmit) origEmit(channel, payload);
            } catch {}
            pushStoreUpdateEvent(channel, payload);
        };
        storeUpdateService.sendEvent = combined;
        if (storeUpdateService.agent) {
            storeUpdateService.agent.send = combined;
        }
    }
    if (storeInstallService) {
        const origSendInstall = storeInstallService.sendEvent?.bind(storeInstallService) || storeInstallService.sendEvent;
        const combinedInstall = (channel, payload) => {
            try {
                if (origSendInstall) origSendInstall(channel, payload);
            } catch {}
            pushStoreUpdateEvent(channel, payload);
        };
        storeInstallService.sendEvent = combinedInstall;
    }

    const requireTerminal = () => {
        if (!terminal)
            throw Object.assign(new Error('Terminal is not available in this build'), { status: 501 });
        return terminal;
    };
    const requireStoreUpdate = () => {
        if (!storeUpdateService)
            throw Object.assign(new Error('Store update is not available in this build'), { status: 501 });
        return storeUpdateService;
    };
    const requireStoreInstall = () => {
        if (!storeInstallService)
            throw Object.assign(new Error('Store install is not available in this build'), { status: 501 });
        return storeInstallService;
    };
    let server = null;
    let current = { running: false, port: 0, error: null };
    function readConfig() {
        let config = {};
        try {
            config = JSON.parse(database.getSettings().companion_server || '{}');
        }
        catch {
            config = {};
        }
        return config;
    }
    /** Loads the stored config, minting the token and default port on first use. */
    function ensureConfig() {
        const config = readConfig();
        let dirty = false;
        if (!config.token) {
            config.token = newToken();
            dirty = true;
        }
        if (config.port === undefined || config.port === null || config.port === '') {
            config.port = DEFAULT_PORT;
            dirty = true;
        }
        if (dirty)
            database.saveSettings({ companion_server: JSON.stringify(config) }, 'Companion server');
        return config;
    }
    function sendJson(response, status, body) {
        const payload = JSON.stringify(body ?? null);
        response.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(payload),
            'cache-control': 'no-store',
            ...CORS_HEADERS
        });
        response.end(payload);
    }
    function readBody(request) {
        return new Promise((resolve, reject) => {
            let size = 0;
            const chunks = [];
            request.on('data', (chunk) => {
                size += chunk.length;
                if (size > 1024 * 1024) {
                    reject(Object.assign(new Error('Payload too large'), { status: 413 }));
                    request.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            request.on('end', () => {
                if (!chunks.length)
                    return resolve(null);
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                }
                catch {
                    reject(Object.assign(new Error('Body must be JSON'), { status: 400 }));
                }
            });
            request.on('error', reject);
        });
    }
    // One entry per remote capability. `open` skips the token gate (health only,
    // so the phone can verify reachability before the user pastes the token).
    const routes = {
        'GET /api/health': {
            open: true,
            handler: () => ({ ok: true, app: 'HyperFamily Branch Monitor', version: appVersion })
        },
        'POST /api/auth/login': {
            handler: (body) => {
                const user = database.authenticate(body?.username, body?.password);
                if (!user)
                    throw Object.assign(new Error('Invalid username or password'), { status: 401 });
                return user;
            }
        },
        'GET /api/app/info': {
            handler: () => ({ version: appVersion, platform: `${os.type()} ${os.release()}`, companion: true })
        },
        'GET /api/monitor': {
            handler: () => database.getMonitorSnapshot(database.getSettings().ping_history_count || 30)
        },
        'GET /api/branches': { handler: () => database.listBranches() },
        'GET /api/devices': { handler: () => database.listDevices() },
        'POST /api/branches': { handler: (body) => database.saveBranch(body || {}, 'Companion') },
        'POST /api/devices': { handler: (body) => database.saveDevice(body || {}, 'Companion') },
        'POST /api/branches/remove': { handler: (body) => database.deleteBranch(Number(body?.id), 'Companion') },
        'POST /api/devices/remove': { handler: (body) => database.deleteDevice(Number(body?.id), 'Companion') },
        'GET /api/settings': { handler: () => database.getSettings() },
        'POST /api/settings': { handler: (body) => database.saveSettings(body || {}, 'Companion') },
        // v3.9.0: the rest of the reading/writing surface, so the phone is a full
        // companion — notes, terminal snippets, inventory and credentials.
        'GET /api/notes': { handler: () => database.listNotes() },
        'POST /api/notes': { handler: (body) => database.saveNote(body || {}, 'Companion') },
        'POST /api/notes/remove': {
            handler: (body) => database.deleteNote(Number(body?.id), 'Companion')
        },
        'GET /api/snippets': { handler: () => database.listSnippets() },
        'POST /api/snippets': { handler: (body) => database.saveSnippet(body || {}, 'Companion') },
        'POST /api/snippets/remove': {
            handler: (body) => database.deleteSnippet(Number(body?.id), 'Companion')
        },
        'GET /api/inventory': { handler: () => database.listInventory() },
        'GET /api/credentials': { handler: () => database.listCredentials() },
        'GET /api/credentials/map': { handler: () => database.getCredentialMap() },
        'GET /api/credentials/overview': { handler: () => database.listDeviceCredentialOverview() },
        // Interactive terminal over the LAN (v3.10.0): the exact service the
        // desktop uses, token-gated, streamed through the event ring buffer.
        'GET /api/terminal/targets': { handler: () => requireTerminal().targets() },
        'POST /api/terminal/open': {
            handler: (body) => requireTerminal().open({
                deviceId: Number(body?.deviceId),
                cols: Number(body?.cols) || 80,
                rows: Number(body?.rows) || 24
            }, companionSender, 'Companion')
        },
        'POST /api/terminal/write': {
            handler: (body) => {
                requireTerminal().write(String(body?.sessionId), String(body?.data ?? ''), companionSender);
                return { ok: true };
            }
        },
        'POST /api/terminal/resize': {
            handler: (body) => {
                requireTerminal().resize(String(body?.sessionId), { cols: Number(body?.cols) || 80, rows: Number(body?.rows) || 24 }, companionSender);
                return { ok: true };
            }
        },
        'POST /api/terminal/close': {
            handler: (body) => {
                requireTerminal().close(String(body?.sessionId), 'Closed from the companion app');
                return { ok: true };
            }
        },
        'GET /api/terminal/events': {
            handler: (_body, url) => {
                const after = Number(url.searchParams.get('after') || 0);
                return terminalEvents.filter((event) => event.seq > after);
            }
        },
        // Store-update surface for phone (v3.10.2): import agent, version checks, deploy, install
        'GET /api/store-update/version-cache': {
            handler: () => requireStoreUpdate().getCachedVersions()
        },
        'POST /api/store-update/version': {
            handler: async (body) => requireStoreUpdate().checkOneCached(body?.checkout || {})
        },
        'POST /api/store-update/versions': {
            handler: async (body) => requireStoreUpdate().checkMany(Array.isArray(body?.checkouts) ? body.checkouts : [])
        },
        'POST /api/store-update/installed': {
            handler: async (body) => requireStoreUpdate().listInstalledOn(body?.checkout || {})
        },
        'POST /api/store-update/import-agent': {
            handler: async (body) => requireStoreUpdate().agent.importOne(body?.checkout || {}, { runId: body?.runId })
        },
        'POST /api/store-update/import-agent-all': {
            handler: async (body) => requireStoreUpdate().agent.importAll(Array.isArray(body?.checkouts) ? body.checkouts : [], { runId: body?.runId })
        },
        'POST /api/store-update/cancel-agent-import': {
            handler: (body) => requireStoreUpdate().agent.cancel(body?.runId)
        },
        'POST /api/store-update/deploy': {
            handler: async (body) => requireStoreUpdate().deployOne(body?.checkout || {}, { source: body?.source, destinationPath: body?.destinationPath })
        },
        'POST /api/store-update/deploy-all': {
            handler: async (body) => requireStoreUpdate().deployAll(Array.isArray(body?.checkouts) ? body.checkouts : [], { source: body?.source, destinationPath: body?.destinationPath })
        },
        'POST /api/store-update/test-access': {
            handler: async (body) => {
                const host = String(body?.host || '').trim();
                if (!host) throw new Error('Host is required');
                return requireStoreUpdate().smb.test(host, null);
            }
        },
        'POST /api/store-update/install': {
            handler: async (body) => requireStoreInstall().installOne(body?.checkout || {}, { destinationPath: body?.destinationPath })
        },
        'POST /api/store-update/install-all': {
            handler: async (body) => requireStoreInstall().installAll(Array.isArray(body?.checkouts) ? body.checkouts : [], { destinationPath: body?.destinationPath, runId: body?.runId })
        },
        'POST /api/store-update/cancel-install': {
            handler: (body) => requireStoreInstall().cancel(body?.runId)
        },
        'GET /api/store-update/events': {
            handler: (_body, url) => {
                const after = Number(url.searchParams.get('after') || 0);
                return storeUpdateEvents.filter((event) => event.seq > after);
            }
        },
        'GET /api/app/files': {
            handler: (body, url) => {
                const dir = url.searchParams.get('dir') || '';
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const base = dir || 'C:\\Store Commerce\\Updates';
                    // Delegate to app's file list if available via database? For companion, list via fs if local
                    // For now, return mock that will be replaced by real IPC in desktop, but companion can list via fs on workstation
                    if (fs.existsSync(base)) {
                        const entries = fs.readdirSync(base, { withFileTypes: true }).map((d) => ({
                            name: d.name,
                            path: path.join(base, d.name),
                            isDirectory: d.isDirectory(),
                            isFile: d.isFile(),
                            size: d.isFile() ? (() => { try { return fs.statSync(path.join(base, d.name)).size; } catch { return 0; } })() : 0,
                            modified: (() => { try { return fs.statSync(path.join(base, d.name)).mtime.toISOString(); } catch { return new Date().toISOString(); } })()
                        }));
                        return { directory: base, parent: path.dirname(base), files: entries };
                    }
                    return { directory: base, parent: 'C:\\', files: [] };
                } catch (e) {
                    return { directory: dir || '', parent: '', files: [], error: e.message };
                }
            }
        }
    };
    function serveStatic(request, response, pathname) {
        let requested = decodeURIComponent(pathname);
        if (requested.endsWith('/'))
            requested += 'index.html';
        if (!path.extname(requested))
            requested += '/index.html';
        const filePath = path.resolve(exportRoot, `.${requested}`);
        if (!filePath.startsWith(`${exportRoot}${path.sep}`) ||
            !fs.existsSync(filePath) ||
            !fs.statSync(filePath).isFile()) {
            response.writeHead(404, { 'content-type': 'text/plain' });
            return response.end('Not found');
        }
        let data = fs.readFileSync(filePath);
        if (filePath.endsWith('index.html')) {
            // The bridge teaches the served renderer how to reach this server
            // instead of the (absent) Electron preload. It must run before any
            // application script, hence the injection at the top of <head>.
            const html = data
                .toString('utf8')
                .replace('<head>', '<head><script src="/companion-bridge.js"></script>');
            data = Buffer.from(html, 'utf8');
        }
        response.writeHead(200, {
            'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'cache-control': 'no-cache'
        });
        response.end(data);
    }
    async function handle(request, response) {
        const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
        try {
            // CORS preflight (a token-bearing POST triggers one from a foreign origin).
            if (request.method === 'OPTIONS') {
                response.writeHead(204, { 'cache-control': 'no-store', ...CORS_HEADERS });
                return response.end();
            }
            if (url.pathname === '/companion-bridge.js') {
                const bridge = fs.readFileSync(BRIDGE_FILE, 'utf8');
                response.writeHead(200, {
                    'content-type': 'text/javascript; charset=utf-8',
                    'cache-control': 'no-cache'
                });
                return response.end(bridge);
            }
            if (url.pathname.startsWith('/api/')) {
                const route = routes[`${request.method} ${url.pathname}`];
                if (!route)
                    return sendJson(response, 404, { error: 'Unknown endpoint' });
                const config = ensureConfig();
                if (!route.open && request.headers.authorization !== `Bearer ${config.token}`) {
                    return sendJson(response, 401, {
                        error: 'Unauthorized — enter the companion token shown in Settings'
                    });
                }
                const body = request.method === 'POST' ? await readBody(request) : null;
                const result = await route.handler(body, url);
                return sendJson(response, 200, result);
            }
            return serveStatic(request, response, url.pathname);
        }
        catch (error) {
            return sendJson(response, error.status || 500, { error: error.message || 'Server error' });
        }
    }
    async function start() {
        if (server)
            return state();
        const config = ensureConfig();
        // 0 is honoured as "any free port" (handy for tests); anything unusable
        // falls back to the default.
        const requested = Number(config.port);
        const port = Number.isInteger(requested) && requested >= 0 && requested <= 65535 ? requested : DEFAULT_PORT;
        return new Promise((resolve) => {
            const candidate = http.createServer((request, response) => {
                handle(request, response).catch(() => {
                    if (!response.headersSent)
                        sendJson(response, 500, { error: 'Server error' });
                });
            });
            candidate.once('error', (error) => {
                current = { running: false, port, error: error.message };
                resolve(state());
            });
            candidate.listen(port, '0.0.0.0', () => {
                server = candidate;
                current = { running: true, port: candidate.address().port, error: null };
                resolve(state());
            });
        });
    }
    async function stop() {
        if (server) {
            // Drop keep-alive sockets immediately so the port is really free (and no
            // client can reuse a dead connection after a stop).
            if (server.closeAllConnections)
                server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
        server = null;
        current = { running: false, port: current.port, error: null };
        return state();
    }
    /** Applies { enabled, port } from Settings and starts/stops accordingly. */
    async function configure(patch) {
        const config = ensureConfig();
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'port')) {
            const port = Number(patch.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535)
                throw new Error('The port must be a number between 1 and 65535');
            config.port = port;
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'enabled'))
            config.enabled = Boolean(patch.enabled);
        database.saveSettings({ companion_server: JSON.stringify(config) }, 'Companion server');
        if (config.enabled && !server)
            return start();
        if (!config.enabled && server)
            return stop();
        return state();
    }
    function rotateToken() {
        const config = ensureConfig();
        config.token = newToken();
        database.saveSettings({ companion_server: JSON.stringify(config) }, 'Companion server');
        return state();
    }
    function state() {
        const config = readConfig();
        const configured = Number(config.port);
        return {
            running: Boolean(server),
            enabled: Boolean(config.enabled),
            port: current.running
                ? current.port
                : Number.isInteger(configured) && configured >= 0
                    ? configured
                    : DEFAULT_PORT,
            token: config.token || '',
            addresses: lanAddresses(),
            error: current.error
        };
    }
    /** App startup hook: honour a previously enabled server without UI action. */
    function autostart() {
        try {
            if (readConfig().enabled)
                return start();
        }
        catch {
            /* the database may not be ready yet; the Settings card can start it manually */
        }
        return Promise.resolve(state());
    }
    return { start, stop, configure, rotateToken, state, autostart };
}
module.exports = { createCompanionServer, DEFAULT_PORT };
