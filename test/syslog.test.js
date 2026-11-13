const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { spawnSync } = require('node:child_process');

const { NodeOperationError } = require('n8n-workflow');
const { Syslog } = require('../dist/nodes/Syslog/Syslog.node.js');

// Self signed certificate for the TLS tests, created with openssl
let cert;
let key;
let tmpDir;

before(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syslog-test-'));
	const result = spawnSync('openssl', [
		'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
		'-subj', '/CN=localhost',
		'-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
		'-keyout', path.join(tmpDir, 'key.pem'),
		'-out', path.join(tmpDir, 'cert.pem'),
	]);

	if (result.status === 0) {
		cert = fs.readFileSync(path.join(tmpDir, 'cert.pem'), 'utf8');
		key = fs.readFileSync(path.join(tmpDir, 'key.pem'), 'utf8');
	}
});

after(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Collects everything a receiver gets and lets a test wait for a number of messages
const collector = () => {
	const messages = [];
	const waiters = [];

	return {
		messages,
		push(message) {
			messages.push(message);
			waiters.forEach((check) => check());
		},
		waitFor(count) {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error(`Expected ${count} messages, got ${messages.length}`)),
					3000,
				);
				const check = () => {
					if (messages.length >= count) {
						clearTimeout(timer);
						resolve(messages);
					}
				};
				waiters.push(check);
				check();
			});
		},
	};
};

const udpReceiver = async () => {
	const received = collector();
	const server = dgram.createSocket('udp4');
	server.on('message', (data) => received.push(data.toString()));
	await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve));

	return { ...received, port: server.address().port, close: () => server.close() };
};

// Plain TCP or TLS receiver, messages are newline delimited
const streamReceiver = async (secure) => {
	const received = collector();
	let connections = 0;
	let closed = 0;

	const handler = (socket) => {
		connections++;
		let buffer = '';
		socket.on('data', (data) => {
			buffer += data.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop();
			lines.forEach((line) => received.push(line));
		});
		socket.on('error', () => {});
		socket.on('close', () => closed++);
	};

	const server = secure ? tls.createServer({ key, cert }, handler) : net.createServer(handler);
	server.on('tlsClientError', () => {});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

	return {
		...received,
		port: server.address().port,
		stats: () => ({ connections, closed }),
		close: () => server.close(),
	};
};

const closedPort = async () => {
	const server = net.createServer();
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	await new Promise((resolve) => server.close(resolve));
	return port;
};

// Runs the node with a fake execution context. A parameter can be a function of the item index.
const run = ({ credentials, params = {}, items = [{ json: {} }], continueOnFail = false }) => {
	const defaults = {
		rfc: 'default',
		facility: 16,
		severity: 6,
		hostname: 'host',
		appname: 'app',
		message: 'hello',
		itemKeyName: 'syslogStatus',
	};
	const all = { ...defaults, ...params };

	const context = {
		getInputData: () => items,
		getCredentials: async () => ({ host: '127.0.0.1', rfc: false, protocol: 'udp', ...credentials }),
		getNodeParameter: (name, i) => (typeof all[name] === 'function' ? all[name](i) : all[name]),
		getNode: () => ({ name: 'Syslog', type: 'syslog', typeVersion: 1, parameters: {} }),
		continueOnFail: () => continueOnFail,
	};

	return new Syslog().execute.call(context);
};

test('sends an RFC5424 message with priority, hostname and app name', async () => {
	const receiver = await udpReceiver();
	await run({ credentials: { port: receiver.port }, params: { facility: 19, severity: 3 } });
	const [message] = await receiver.waitFor(1);
	receiver.close();

	// Local3 (19) * 8 + Error (3) = 155
	assert.match(message, /^<155>1 \d{4}-\d\d-\d\dT[\d:.]+Z host app \d+ - - hello\n$/);
});

test('sends an RFC3164 message with the app name as tag', async () => {
	const receiver = await udpReceiver();
	await run({ credentials: { port: receiver.port }, params: { rfc: true } });
	const [message] = await receiver.waitFor(1);
	receiver.close();

	assert.match(message, /^<134>[A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d host app: hello\n$/);
});

test('node syslog version overrides the credential default', async () => {
	const receiver = await udpReceiver();
	await run({ credentials: { port: receiver.port, rfc: false }, params: { rfc: true } });
	await run({ credentials: { port: receiver.port, rfc: true }, params: { rfc: false } });
	const [first, second] = await receiver.waitFor(2);
	receiver.close();

	assert.match(first, /^<134>[A-Z][a-z]{2} /);
	assert.match(second, /^<134>1 /);
});

test('uses the credential syslog version by default', async () => {
	const receiver = await udpReceiver();
	await run({ credentials: { port: receiver.port, rfc: true } });
	const [message] = await receiver.waitFor(1);
	receiver.close();

	assert.match(message, /^<134>[A-Z][a-z]{2} /);
});

test('falls back to n8n when the app name is empty', async () => {
	const receiver = await udpReceiver();
	await run({ credentials: { port: receiver.port }, params: { appname: '' } });
	await run({ credentials: { port: receiver.port }, params: { appname: '', rfc: true } });
	const [rfc5424, rfc3164] = await receiver.waitFor(2);
	receiver.close();

	assert.match(rfc5424, / host n8n \d+ /);
	assert.match(rfc3164, / host n8n: hello\n$/);
});

test('reads hostname, app name and message for every item', async () => {
	const receiver = await udpReceiver();
	await run({
		credentials: { port: receiver.port },
		items: [{ json: {} }, { json: {} }, { json: {} }],
		params: {
			hostname: (i) => `host${i}`,
			appname: (i) => `app${i}`,
			message: (i) => `item ${i}`,
		},
	});
	const messages = await receiver.waitFor(3);
	receiver.close();

	messages.sort();
	messages.forEach((message, i) => {
		assert.match(message, new RegExp(`^<134>1 \\S+ host${i} app${i} \\d+ - - item ${i}\\n$`));
	});
});

test('escapes line breaks so a message stays a single entry', async () => {
	const receiver = await streamReceiver(false);
	await run({
		credentials: { port: receiver.port, protocol: 'tcp' },
		params: { message: 'first\nforged\r\nlast\n' },
	});
	const messages = await receiver.waitFor(1);
	// Give a forged second entry the chance to show up
	await new Promise((resolve) => setTimeout(resolve, 100));
	receiver.close();

	assert.equal(messages.length, 1);
	assert.match(messages[0], / - - first\\nforged\\r\\nlast$/);
});

test('returns the input item with a status and the original message', async () => {
	const receiver = await udpReceiver();
	const [output] = await run({
		credentials: { port: receiver.port },
		items: [{ json: { id: 7 } }],
		params: { message: 'line\n', itemKeyName: 'result' },
	});
	receiver.close();

	assert.deepEqual(output, [
		{
			json: { id: 7, result: { status: 'Message sent', message: 'line\n' } },
			pairedItem: { item: 0 },
		},
	]);
});

test('delivers over TCP and closes the connection afterwards', async () => {
	const receiver = await streamReceiver(false);
	await run({
		credentials: { port: receiver.port, protocol: 'tcp' },
		items: [{ json: {} }, { json: {} }],
	});
	await receiver.waitFor(2);
	await new Promise((resolve) => setTimeout(resolve, 100));
	const { connections, closed } = receiver.stats();
	receiver.close();

	// One connection for the whole execution, and it is released at the end
	assert.equal(connections, 1);
	assert.equal(closed, 1);
});

test('fails with the item index when the server is unreachable', async () => {
	const port = await closedPort();

	await assert.rejects(
		run({
			credentials: { port, protocol: 'tcp' },
			items: [{ json: {} }, { json: {} }],
		}),
		(error) => {
			assert.ok(error instanceof NodeOperationError);
			assert.equal(error.context.itemIndex, 0);
			return true;
		},
	);
});

test('continues with the remaining items when continue on fail is enabled', async () => {
	const port = await closedPort();
	const [output] = await run({
		credentials: { port, protocol: 'tcp' },
		items: [{ json: { id: 1 } }, { json: { id: 2 } }],
		continueOnFail: true,
	});

	assert.equal(output.length, 2);
	output.forEach((item, i) => {
		assert.equal(item.json.id, i + 1);
		assert.equal(item.json.syslogStatus.status, 'Error');
		assert.match(item.json.syslogStatus.error, /ECONNREFUSED/);
		assert.deepEqual(item.pairedItem, { item: i });
	});
});

test('delivers over TLS when the certificate is trusted', async (t) => {
	if (!cert) return t.skip('openssl is not available');

	const receiver = await streamReceiver(true);
	await run({
		credentials: { port: receiver.port, protocol: 'tls', caCertificate: cert },
		items: [{ json: {} }, { json: {} }],
	});
	const messages = await receiver.waitFor(2);
	receiver.close();

	assert.equal(messages.length, 2);
});

test('refuses an untrusted TLS certificate and sends nothing', async (t) => {
	if (!cert) return t.skip('openssl is not available');

	const receiver = await streamReceiver(true);
	await assert.rejects(
		run({ credentials: { port: receiver.port, protocol: 'tls' } }),
		(error) => error instanceof NodeOperationError && error.context.itemIndex === 0,
	);
	await new Promise((resolve) => setTimeout(resolve, 100));
	const sent = receiver.messages.length;
	receiver.close();

	assert.equal(sent, 0);
});

test('delivers over TLS with ignore SSL issues enabled', async (t) => {
	if (!cert) return t.skip('openssl is not available');

	const receiver = await streamReceiver(true);
	await run({
		credentials: { port: receiver.port, protocol: 'tls', allowUnauthorizedCerts: true },
	});
	const messages = await receiver.waitFor(1);
	receiver.close();

	assert.equal(messages.length, 1);
});
