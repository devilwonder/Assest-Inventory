import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;

function isDisallowedIp(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }
  const v4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  const parts = v4.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function extractHost(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname;
    }
  } catch {
    // Fallback below
  }
  return trimmed.replace(/^ldaps?:\/\//i, '').split('/')[0].split(':')[0].trim();
}

async function assertSafeExternalHost(rawHost: string): Promise<{ hostname: string; address: string }> {
  const hostname = extractHost(rawHost);
  if (!hostname || hostname.length > 200) {
    throw new Error('A valid external hostname or IP is required.');
  }
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === 'metadata.google.internal' ||
    lower.endsWith('.internal') ||
    lower.endsWith('.local')
  ) {
    throw new Error(`Target host "${hostname}" is restricted for security reasons.`);
  }
  if (net.isIP(hostname)) {
    if (isDisallowedIp(hostname)) {
      throw new Error(`Target IP "${hostname}" is restricted.`);
    }
    return { hostname, address: hostname };
  }
  const resolved = await dns.lookup(hostname);
  if (isDisallowedIp(resolved.address)) {
    throw new Error(`Resolved address for "${hostname}" is restricted.`);
  }
  return { hostname, address: resolved.address };
}

function readSmtpReply(socket: net.Socket | tls.TLSSocket, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP server response timed out.'));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
      const last = lines[lines.length - 1];
      if (last && /^\d{3}\s/.test(last)) {
        cleanup();
        resolve(lines.join('\n'));
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      if (buffer) resolve(buffer);
      else reject(new Error('Connection closed by remote SMTP server.'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function sendSmtpCommand(
  socket: net.Socket | tls.TLSSocket,
  command: string
): Promise<{ code: number; text: string }> {
  socket.write(`${command}\r\n`);
  const text = await readSmtpReply(socket);
  const code = Number.parseInt(text.split(/\r?\n/).pop()?.slice(0, 3) || '0', 10);
  return { code, text };
}

function encodeBerLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeBerTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeBerLength(content.length), content]);
}

function buildLdapBindRequest(bindDn: string, bindPassword: string): Buffer {
  const msgId = encodeBerTag(0x02, Buffer.from([0x01]));
  const version = encodeBerTag(0x02, Buffer.from([0x03]));
  const name = encodeBerTag(0x04, Buffer.from(bindDn, 'utf8'));
  const auth = encodeBerTag(0x80, Buffer.from(bindPassword, 'utf8'));
  const bindOp = encodeBerTag(0x60, Buffer.concat([version, name, auth]));
  return encodeBerTag(0x30, Buffer.concat([msgId, bindOp]));
}

function parseBerLength(buf: Buffer, offset: number): { length: number; nextOffset: number } {
  const first = buf[offset];
  if (first < 0x80) {
    return { length: first, nextOffset: offset + 1 };
  }
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[offset + 1 + i];
  }
  return { length, nextOffset: offset + 1 + numBytes };
}

function parseLdapBindResultCode(buf: Buffer): number | null {
  if (buf.length < 7 || buf[0] !== 0x30) return null;
  const outer = parseBerLength(buf, 1);
  let pos = outer.nextOffset;
  if (buf[pos] !== 0x02) return null;
  const msgIdLen = parseBerLength(buf, pos + 1);
  pos = msgIdLen.nextOffset + msgIdLen.length;
  if (buf[pos] !== 0x61) return null;
  const opLen = parseBerLength(buf, pos + 1);
  pos = opLen.nextOffset;
  if (buf[pos] !== 0x0a) return null;
  const codeLen = parseBerLength(buf, pos + 1);
  if (codeLen.length < 1) return null;
  return buf[codeLen.nextOffset];
}

const LDAP_RESULT_LABELS: Record<number, string> = {
  0: 'Success (Bind Authenticated)',
  1: 'Operations Error',
  2: 'Protocol Error',
  7: 'Auth Method Not Supported',
  32: 'No Such Object (Check Base DN)',
  34: 'Invalid DN Syntax',
  48: 'Inappropriate Authentication',
  49: 'Invalid Bind Credentials',
  50: 'Insufficient Access Rights',
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/org/test-smtp', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const body = req.body as {
        host?: string;
        port?: number;
        security?: string;
        username?: string;
        password?: string;
        fromEmail?: string;
        fromName?: string;
        testRecipient?: string;
      };
      const hostRaw = String(body.host || '').trim();
      const port = Number(body.port || 587);
      const security = String(body.security || 'STARTTLS');
      if (!hostRaw || Number.isNaN(port) || port < 1 || port > 65535) {
        res.status(400).json({ ok: false, error: 'Valid SMTP host and port (1-65535) are required.' });
        return;
      }

      const { hostname } = await assertSafeExternalHost(hostRaw);

      let socket: net.Socket | tls.TLSSocket =
        security === 'SSL/TLS'
          ? await new Promise<tls.TLSSocket>((resolve, reject) => {
              const s = tls.connect({ host: hostname, port, servername: hostname, timeout: 6000 }, () =>
                resolve(s)
              );
              s.once('error', reject);
              s.once('timeout', () => {
                s.destroy();
                reject(new Error('TLS connection timed out.'));
              });
            })
          : await new Promise<net.Socket>((resolve, reject) => {
              const s = net.connect({ host: hostname, port, timeout: 6000 }, () => resolve(s));
              s.once('error', reject);
              s.once('timeout', () => {
                s.destroy();
                reject(new Error('TCP connection timed out.'));
              });
            });

      try {
        const banner = await readSmtpReply(socket);
        const ehlo = await sendSmtpCommand(socket, 'EHLO dextra.local');
        let startTlsUpgraded = false;

        if (security === 'STARTTLS' && /STARTTLS/i.test(ehlo.text)) {
          const st = await sendSmtpCommand(socket, 'STARTTLS');
          if (st.code === 220) {
            socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
              const upgraded = tls.connect(
                { socket, servername: hostname, timeout: 6000 },
                () => resolve(upgraded)
              );
              upgraded.once('error', reject);
            });
            await sendSmtpCommand(socket, 'EHLO dextra.local');
            startTlsUpgraded = true;
          }
        }

        let testEmailSent = false;
        if (body.testRecipient && body.fromEmail && body.username && body.password) {
          const authInit = await sendSmtpCommand(socket, 'AUTH LOGIN');
          if (authInit.code !== 334) {
            throw new Error(`SMTP AUTH LOGIN rejected (${authInit.text})`);
          }
          const userResp = await sendSmtpCommand(
            socket,
            Buffer.from(body.username, 'utf8').toString('base64')
          );
          if (userResp.code !== 334) {
            throw new Error(`SMTP username rejected (${userResp.text})`);
          }
          const passResp = await sendSmtpCommand(
            socket,
            Buffer.from(body.password, 'utf8').toString('base64')
          );
          if (passResp.code !== 235) {
            throw new Error(`SMTP authentication failed (${passResp.text})`);
          }
          const mailFrom = await sendSmtpCommand(socket, `MAIL FROM:<${body.fromEmail}>`);
          if (mailFrom.code >= 400) throw new Error(mailFrom.text);
          const rcptTo = await sendSmtpCommand(socket, `RCPT TO:<${body.testRecipient}>`);
          if (rcptTo.code >= 400) throw new Error(rcptTo.text);
          const dataCmd = await sendSmtpCommand(socket, 'DATA');
          if (dataCmd.code !== 354) throw new Error(dataCmd.text);
          const msg = [
            `From: "${body.fromName || 'Dextra AssetLedger'}" <${body.fromEmail}>`,
            `To: <${body.testRecipient}>`,
            `Subject: Dextra AssetLedger SMTP Verification`,
            `Content-Type: text/plain; charset=utf-8`,
            ``,
            `This confirms Dextra AssetLedger SMTP relay connectivity from ${hostname}:${port}.`,
            `.`,
          ].join('\r\n');
          const sent = await sendSmtpCommand(socket, msg);
          if (sent.code >= 400) throw new Error(sent.text);
          testEmailSent = true;
        }

        try {
          socket.write('QUIT\r\n');
        } catch {
          // ignore
        }
        socket.end();

        res.json({
          ok: true,
          latencyMs: Date.now() - startedAt,
          banner: banner.split(/\r?\n/)[0],
          tlsActive: security === 'SSL/TLS' || startTlsUpgraded,
          testEmailSent,
        });
      } catch (innerErr) {
        socket.destroy();
        throw innerErr;
      }
    } catch (err) {
      res.status(400).json({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : 'SMTP connection failed.',
      });
    }
  });

  app.post('/api/org/test-ldap', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const body = req.body as {
        serverUrl?: string;
        port?: number;
        useTls?: boolean;
        bindDn?: string;
        bindPassword?: string;
      };
      const serverUrl = String(body.serverUrl || '').trim();
      const port = Number(body.port || (body.useTls ? 636 : 389));
      const useTls = Boolean(body.useTls) || serverUrl.toLowerCase().startsWith('ldaps://');

      if (!serverUrl || Number.isNaN(port) || port < 1 || port > 65535) {
        res.status(400).json({ ok: false, error: 'Valid LDAP server URL and port are required.' });
        return;
      }

      const { hostname } = await assertSafeExternalHost(serverUrl);

      const socket: net.Socket | tls.TLSSocket = useTls
        ? await new Promise<tls.TLSSocket>((resolve, reject) => {
            const s = tls.connect({ host: hostname, port, servername: hostname, timeout: 6000 }, () =>
              resolve(s)
            );
            s.once('error', reject);
            s.once('timeout', () => {
              s.destroy();
              reject(new Error('LDAPS connection timed out.'));
            });
          })
        : await new Promise<net.Socket>((resolve, reject) => {
            const s = net.connect({ host: hostname, port, timeout: 6000 }, () => resolve(s));
            s.once('error', reject);
            s.once('timeout', () => {
              s.destroy();
              reject(new Error('LDAP TCP connection timed out.'));
            });
          });

      try {
        let bindSummary = 'TCP/TLS Handshake Succeeded';
        let bindCode: number | null = null;

        if (body.bindDn?.trim()) {
          const packet = buildLdapBindRequest(body.bindDn.trim(), body.bindPassword || '');
          const responseBuf = await new Promise<Buffer>((resolve, reject) => {
            const timer = setTimeout(() => {
              socket.destroy();
              reject(new Error('LDAP BindResponse timed out.'));
            }, 6000);
            socket.once('data', (chunk) => {
              clearTimeout(timer);
              resolve(chunk);
            });
            socket.once('error', (err) => {
              clearTimeout(timer);
              reject(err);
            });
            socket.write(packet);
          });
          bindCode = parseLdapBindResultCode(responseBuf);
          if (bindCode === null) {
            throw new Error('Received unexpected response from LDAP server.');
          }
          bindSummary = LDAP_RESULT_LABELS[bindCode] || `LDAP Result Code ${bindCode}`;
          if (bindCode !== 0) {
            throw new Error(bindSummary);
          }
        }

        socket.end();
        res.json({
          ok: true,
          latencyMs: Date.now() - startedAt,
          tlsActive: useTls,
          bindCode,
          summary: bindSummary,
        });
      } catch (innerErr) {
        socket.destroy();
        throw innerErr;
      }
    } catch (err) {
      res.status(400).json({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : 'LDAP connection failed.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AssetLedger Dextra server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
