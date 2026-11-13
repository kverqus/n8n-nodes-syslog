import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import * as net from 'net';
import * as syslog from 'syslog-client';
import * as tls from 'tls';

// syslog-client has no TLS support, so open the connection ourselves
const connectTls = (options: tls.ConnectionOptions) =>
	new Promise<tls.TLSSocket>((resolve, reject) => {
		const socket = tls.connect(options, () => {
			socket.off('error', reject);
			socket.setTimeout(0);
			resolve(socket);
		});

		socket.once('error', reject);
		socket.setTimeout(10000, () => socket.destroy(new Error('connection timed out')));
	});

export class Syslog implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Syslog',
		icon: 'file:syslog.svg',
		name: 'syslog',
		group: ['transform'],
		version: 1,
		description: 'Forwards data to an external syslog receiver',
		defaults: {
			name: 'Syslog',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'syslogServerApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Syslog Version',
				name: 'rfc',
				type: 'options',
				options: [
					{
						name: 'Default (From Credential)',
						value: 'default',
					},
					{
						name: 'RFC3164 (BSD)',
						value: true,
					},
					{
						name: 'RFC5424',
						value: false,
					},
				],
				default: 'default',
				description:
					'Which syslog version to use. Choose "Default" to use the setting from your credential, or override with a specific version.',
			},
			{
				displayName: 'Facility',
				name: 'facility',
				type: 'options',
				options: [
					{
						name: 'Kernel',
						value: 0,
					},
					{
						name: 'User',
						value: 1,
					},
					{
						name: 'System',
						value: 3,
					},
					{
						name: 'Audit',
						value: 13,
					},
					{
						name: 'Alert',
						value: 14,
					},
					{
						name: 'Local0',
						value: 16,
					},
					{
						name: 'Local1',
						value: 17,
					},
					{
						name: 'Local2',
						value: 18,
					},
					{
						name: 'Local3',
						value: 19,
					},
					{
						name: 'Local4',
						value: 20,
					},
					{
						name: 'Local5',
						value: 21,
					},
					{
						name: 'Local6',
						value: 22,
					},
					{
						name: 'Local7',
						value: 23,
					},
				],
				default: 1,
				placeholder: 'Message facility',
				required: true,
			},
			{
				displayName: 'Severity',
				name: 'severity',
				type: 'options',
				options: [
					{
						name: 'Emergency',
						value: 0,
					},
					{
						name: 'Alert',
						value: 1,
					},
					{
						name: 'Critical',
						value: 2,
					},
					{
						name: 'Error',
						value: 3,
					},
					{
						name: 'Warning',
						value: 4,
					},
					{
						name: 'Notice',
						value: 5,
					},
					{
						name: 'Informational',
						value: 6,
					},
					{
						name: 'Debug',
						value: 7,
					},
				],
				default: 6,
				placeholder: 'Message severity',
				required: true,
			},
			{
				displayName: 'Hostname',
				name: 'hostname',
				type: 'string',
				default: 'localhost',
				placeholder: 'Hostname for syslog message',
				required: true,
			},
			{
				displayName: 'Application Name',
				name: 'appname',
				type: 'string',
				default: '',
				placeholder: 'App name for syslog message',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				placeholder: 'Message to send to syslog',
				required: true,
			},
			{
				displayName: 'Item Key Name',
				name: 'itemKeyName',
				type: 'string',
				default: 'syslogStatus',
				description: 'Name of the object key that is added to the item',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('syslogServerApi');
		const {
			host: syslogHost,
			port: syslogPort,
			protocol,
			rfc: credentialRfc,
			caCertificate,
			allowUnauthorizedCerts,
		} = credentials as {
			host: string;
			port: number;
			protocol: string;
			rfc: boolean;
			caCertificate?: string;
			allowUnauthorizedCerts?: boolean;
		};

		// Constant array for use with logOptions to set facility based on
		// choice in N8N. Same approach for severity.
		const facilityLevels = {
			0: syslog.Facility.Kernel,
			1: syslog.Facility.User,
			3: syslog.Facility.System,
			13: syslog.Facility.Audit,
			14: syslog.Facility.Alert,
			16: syslog.Facility.Local0,
			17: syslog.Facility.Local1,
			18: syslog.Facility.Local2,
			19: syslog.Facility.Local3,
			20: syslog.Facility.Local4,
			21: syslog.Facility.Local5,
			22: syslog.Facility.Local6,
			23: syslog.Facility.Local7,
		} as const;

		type FacilityKeys = keyof typeof facilityLevels;

		const severityLevels = {
			0: syslog.Severity.Emergency,
			1: syslog.Severity.Alert,
			2: syslog.Severity.Critical,
			3: syslog.Severity.Error,
			4: syslog.Severity.Warning,
			5: syslog.Severity.Notice,
			6: syslog.Severity.Informational,
			7: syslog.Severity.Debug,
		} as const;

		type SeverityKeys = keyof typeof severityLevels;

		// Configure syslog client options
		const clientOptions = {
			transport: ['tcp', 'tls'].includes(protocol) ? syslog.Transport.Tcp : syslog.Transport.Udp,
			port: syslogPort,
		};

		const client = syslog.createClient(syslogHost, clientOptions);

		// The client reuses its transport if one is set, which is how TLS is plugged in
		const clientTransport = client as unknown as { transport_?: tls.TLSSocket };

		// Prevent unhandled error events from crashing n8n
		client.on('error', () => {});

		try {
			for (let i = 0; i < items.length; i++) {
				let itemKeyName = 'syslogStatus';

				try {
					// Get item parameters
					itemKeyName = this.getNodeParameter('itemKeyName', i) as string;
					const nodeRfc = this.getNodeParameter('rfc', i) as string | boolean;
					const hostname = this.getNodeParameter('hostname', i) as string;
					const appName = (this.getNodeParameter('appname', i) as string) || 'n8n';
					const message = this.getNodeParameter('message', i) as string;
					const facility = this.getNodeParameter('facility', i) as number;
					const severity = this.getNodeParameter('severity', i) as number;

					// Determine which RFC setting to use: node override or credential default
					const rfc = nodeRfc === 'default' ? credentialRfc : (nodeRfc as boolean);

					// Configure message options
					const messageOptions = {
						facility: facilityLevels[facility as FacilityKeys],
						severity: severityLevels[severity as SeverityKeys],
						rfc3164: rfc,
						syslogHostname: hostname,
						appName,
					};

					// Connect with TLS, also reconnects if the connection was lost
					if (protocol === 'tls' && !clientTransport.transport_) {
						const socket = await connectTls({
							host: syslogHost,
							port: syslogPort,
							servername: net.isIP(syslogHost) ? undefined : syslogHost,
							ca: caCertificate || undefined,
							rejectUnauthorized: !allowUnauthorizedCerts,
						});

						socket.on('error', (error) => {
							if (clientTransport.transport_ === socket) client.onError(error);
						});
						socket.on('close', () => {
							if (clientTransport.transport_ === socket) client.onClose();
						});

						clientTransport.transport_ = socket;
					}

					// Escape line breaks so a message can't be split
					const cleanMessage = message
						.replace(/[\r\n]+$/, '')
						.replace(/\r/g, '\\r')
						.replace(/\n/g, '\\n');

					// RFC3164 has no app name field, so send it as the tag
					const syslogMessage = rfc ? `${appName}: ${cleanMessage}` : cleanMessage;

					// Send message to syslog
					await new Promise<void>((resolve, reject) => {
						client.log(syslogMessage, messageOptions, (error) => {
							if (error) {
								reject(error);
							} else {
								resolve();
							}
						});
					});

					returnData.push({
						json: {
							...items[i].json,
							[itemKeyName]: {
								status: 'Message sent',
								message,
							},
						},
						pairedItem: { item: i },
					});
				} catch (error) {
					// Keep going with the remaining items if continue on fail is enabled
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								...items[i].json,
								[itemKeyName]: {
									status: 'Error',
									error: error.message,
								},
							},
							pairedItem: { item: i },
						});
						continue;
					}

					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
			}
		} finally {
			// Close client connection
			client.close();
		}

		return [returnData];
	}
}
