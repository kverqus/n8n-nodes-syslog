import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import * as syslog from 'syslog-client';

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
				name: 'syslogServer',
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
						name: 'Default (from credential)',
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

		const credentials = await this.getCredentials('syslogServer');
		const {
			host: syslogHost,
			port: syslogPort,
			protocol,
			rfc: credentialRfc,
		} = credentials as {
			host: string;
			port: number;
			protocol: string;
			rfc: boolean;
		};

		const nodeRfc = this.getNodeParameter('rfc', 0) as string | boolean;
		const hostname = this.getNodeParameter('hostname', 0) as string;
		const appName = this.getNodeParameter('appname', 0) as string;
		const itemKeyName = this.getNodeParameter('itemKeyName', 0) as string;

		// Determine which RFC setting to use: node override or credential default
		const rfc = nodeRfc === 'default' ? credentialRfc : (nodeRfc as boolean);

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
			rfc3164: rfc,
			syslogHostname: hostname,
			transport: protocol === 'tcp' ? syslog.Transport.Tcp : syslog.Transport.Udp,
			port: syslogPort,
			appName: appName,
		};

		const client = syslog.createClient(syslogHost, clientOptions);

		try {
			for (let i = 0; i < items.length; i++) {
				// Get item parameters
				const message = this.getNodeParameter('message', i) as string;
				const facility = this.getNodeParameter('facility', i) as number;
				const severity = this.getNodeParameter('severity', i) as number;

				// Configure message options
				const messageOptions = {
					facility: facilityLevels[facility as FacilityKeys],
					severity: severityLevels[severity as SeverityKeys],
				};

				// Send message to syslog
				await new Promise<void>((resolve, reject) => {
					client.log(message, messageOptions, (error) => {
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
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error);
		}

		return [returnData];
	}
}
