import { proto } from "../../WAProto/index.js";
import { initAuthCreds } from "./auth-utils.js";
import { BufferJSON } from "./generics.js";
import fs from "fs";
import path from "path";
export const useGintokiAuthState = async (config = {}) => {
    const Database = config.Database;
    const folder = config.folder || "./auth";
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    const dbFile = path.join(folder, "auth.db");
    const db = new Database(dbFile);

    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("temp_store = MEMORY");
    db.pragma("cache_size = -128000");
    db.pragma("mmap_size = 30000000000");
    db.pragma("busy_timeout = 5000");

    const table = /^[a-zA-Z_]+$/.test(config.tableName || "auth")
        ? config.tableName || "auth"
        : "auth";

    db.prepare(
        `CREATE TABLE IF NOT EXISTS ${table} (session TEXT, id TEXT, value BLOB, UNIQUE(session, id))`
    ).run();

    const session = config.session || "default";
    const cache = new Map();
    const MAX_CACHE_SIZE = 15000;

    const stmtGet = db.prepare(
        `SELECT value FROM ${table} WHERE id = ? AND session = ?`
    );
    const stmtSet = db.prepare(
        `INSERT INTO ${table} (session, id, value) VALUES (?, ?, ?) ON CONFLICT(session, id) DO UPDATE SET value = excluded.value`
    );
    const stmtDel = db.prepare(
        `DELETE FROM ${table} WHERE id = ? AND session = ?`
    );

    const writeData = (id, value) => {
        if (!id || value === undefined) return;
        const data = Buffer.from(JSON.stringify(value, BufferJSON.replacer));
        stmtSet.run(session, id, data);
        if (cache.size > MAX_CACHE_SIZE) cache.clear();
        cache.set(id, value);
    };

    const batchUpdate = db.transaction(data => {
        for (const category in data) {
            for (const id in data[category]) {
                const value = data[category][id];
                const key = `${category}-${id}`;
                if (value) writeData(key, value);
                else {
                    stmtDel.run(key, session);
                    cache.delete(key);
                }
            }
        }
    });

    const credsRow = stmtGet.get("creds", session);
    let creds = credsRow?.value
        ? JSON.parse(credsRow.value.toString(), BufferJSON.reviver)
        : initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids = []) => {
                    const out = {};
                    const missingIds = [];

                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (cache.has(key)) {
                            out[id] = cache.get(key);
                        } else {
                            missingIds.push(id);
                            out[id] = null;
                        }
                    }

                    if (missingIds.length === 0) return out;

                    const placeholders = missingIds.map(() => "?").join(",");
                    const fullIds = missingIds.map(id => `${type}-${id}`);
                    const rows = db
                        .prepare(
                            `SELECT id, value FROM ${table} WHERE session = ? AND id IN (${placeholders})`
                        )
                        .all(session, ...fullIds);

                    for (const row of rows) {
                        const rawId = row.id.slice(type.length + 1);
                        let value = JSON.parse(
                            row.value.toString(),
                            BufferJSON.reviver
                        );
                        if (type === "app-state-sync-key" && value) {
                            value =
                                proto.Message.AppStateSyncKeyData.fromObject(
                                    value
                                );
                        }
                        out[rawId] = value;
                        cache.set(row.id, value);
                    }
                    return out;
                },
                set: async data => batchUpdate(data)
            }
        },
        saveCreds: async () => writeData("creds", creds),
        clear: async () => {
            db.prepare(
                `DELETE FROM ${table} WHERE id != 'creds' AND session = ?`
            ).run(session);
            cache.clear();
        },
        removeCreds: async () => {
            db.prepare(`DELETE FROM ${table} WHERE session = ?`).run(session);
            cache.clear();
        }
    };
};
