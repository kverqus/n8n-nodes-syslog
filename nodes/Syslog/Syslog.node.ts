import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionTypes,
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
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main, NodeConnectionTypes.Main],
		outputNames: ['syslog', 'passthrough'],
		properties: [
			{
				displayName: 'Host',
				name: 'syslogHost',
				type: 'string',
				default: '',
				placeholder: 'Syslog server IP or hostname',
				required: true,
			},
			{
				displayName: 'Port',
				name: 'syslogPort',
				type: 'number',
				default: 514,
				placeholder: '514 (default)',
				required: true,
			},
			{
				displayName: 'Protocol',
				name: 'protocol',
				type: 'options',
				options: [
					{
						name: 'UDP',
						value: 'udp',
					},
					{
						name: 'TCP',
						value: 'tcp',
					},
				],
				default: 'udp',
				description: 'The protocol to use for sending syslog messages',
				required: true,
			},
			{
				displayName: 'Syslog Version',
				name: 'rfc',
				type: 'options',
				options: [
					{
						name: 'RFC3164 (BSD)',
						value: true,
					},
					{
						name: 'RFC5424',
						value: false,
					},
				],
				default: false,
				description: 'Which syslog version to use',
				required: true,
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
				displayName: 'Enable passthrough',
				name: 'enablePassthrough',
				type: 'boolean',
				default: true,
				description: 'Whether to pass the input data through to a second output',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const passthroughData: INodeExecutionData[] = [];

		const enablePassthrough = this.getNodeParameter('enablePassthrough', 0) as boolean;
		const syslogHost = this.getNodeParameter('syslogHost', 0) as string;
		const syslogPort = this.getNodeParameter('syslogPort', 0) as number;
		const protocol = this.getNodeParameter('protocol', 0) as string;
		const rfc = this.getNodeParameter('rfc', 0) as boolean;
		const hostname = this.getNodeParameter('hostname', 0) as string;
		const appName = this.getNodeParameter('appname', 0) as string;

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
					json: { status: 'Message sent to syslog', message },
				});

				if (enablePassthrough) {
					passthroughData.push(items[i]);
				}
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error);
		}

		if (enablePassthrough) {
			return [returnData, passthroughData];
		} else {
			return [returnData];
		}
	}
}
