import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SyslogServer implements ICredentialType {
	name = 'syslogServer';
	displayName = 'Syslog Server';
	documentationUrl = '';
	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: '',
			placeholder: 'Syslog server IP or hostname',
			required: true,
		},
		{
			displayName: 'Port',
			name: 'port',
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
			description: 'Which syslog version to use as default',
			required: true,
		},
	];
}