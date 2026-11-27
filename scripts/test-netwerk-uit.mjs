/** Voorlaadmodule voor lokale tests. Geen Supabase-, mail-, betaal- of andere netwerkcalls. */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';

const geweigerd = () => { throw new Error('TEST_NETWORK_DISABLED: netwerk is uitgeschakeld in deze testomgeving'); };
globalThis.fetch = async () => geweigerd();
globalThis.WebSocket = class { constructor() { geweigerd(); } };
http.request = geweigerd;
http.get = geweigerd;
https.request = geweigerd;
https.get = geweigerd;
net.connect = geweigerd;
net.createConnection = geweigerd;
net.Socket.prototype.connect = geweigerd;
tls.connect = geweigerd;
dgram.createSocket = geweigerd;
syncBuiltinESMExports();
