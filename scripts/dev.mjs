import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';

const DEFAULT_API_PORT = 8000;
const DEFAULT_WEB_PORT = 5173;

async function loadDevelopmentEnv() {
  let content;
  try {
    content = await readFile(new URL('../.env', import.meta.url), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[match[1]] = value;
  }
}

async function getAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(getAvailablePort(startPort + 1));
    });

    server.once('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      server.close(() => resolve(port));
    });

    server.listen(startPort, '127.0.0.1');
  }).catch((error) => {
    reject(error);
  });
}

async function waitForApi(port, api, timeoutMs = 300000) {
  const started = Date.now();
  let apiExit;
  api.once('exit', (code, signal) => {
    apiExit = { code, signal };
  });

  while (Date.now() - started < timeoutMs) {
    if (apiExit) {
      throw new Error(
        `La API terminó antes de responder (código ${apiExit.code ?? 'desconocido'}, señal ${apiExit.signal ?? 'ninguna'}).`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Espera y reintenta hasta que la API se levante.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`La API no terminó de iniciar en cinco minutos: http://127.0.0.1:${port}/openapi.json`);
}

async function main() {
  await loadDevelopmentEnv();
  const apiPort = Number(process.env.API_PORT || (await getAvailablePort(DEFAULT_API_PORT)));
  const webPort = Number(process.env.WEB_PORT || (await getAvailablePort(DEFAULT_WEB_PORT)));

  const api = spawn('python', ['-m', 'uvicorn', 'api.main:app', '--host', '127.0.0.1', '--port', String(apiPort)], {
    stdio: 'inherit',
    env: { ...process.env, API_PORT: String(apiPort) },
  });

  try {
    await waitForApi(apiPort, api);
  } catch (error) {
    api.kill('SIGTERM');
    throw error;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const web = spawn(npmCommand, ['run', 'dev:web', '--', '--port', String(webPort)], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, API_PORT: String(apiPort), WEB_PORT: String(webPort) },
  });

  const shutdown = () => {
    api.kill('SIGTERM');
    web.kill('SIGTERM');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  web.on('exit', (webCode) => {
    api.kill('SIGTERM');
    process.exit(webCode ?? 0);
  });
}

main().catch((error) => {
  console.error('No se pudo iniciar el entorno de desarrollo:', error);
  process.exit(1);
});
