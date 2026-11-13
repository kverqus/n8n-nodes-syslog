import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SyslogServerApi implements ICredentialType {
	name = 'syslogServerApi';
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
				{
					name: 'TLS (Over TCP)',
					value: 'tls',
				},
			],
			default: 'udp',
			description: 'The protocol to use for sending syslog messages. TLS usually uses port 6514.',
			required: true,
		},
		{
			displayName: 'CA Certificate',
			name: 'caCertificate',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description:
				'PEM encoded CA certificate used to verify the server. Leave empty to use the system trust store.',
			displayOptions: {
				show: {
					protocol: ['tls'],
				},
			},
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if the server certificate cannot be verified',
			displayOptions: {
				show: {
					protocol: ['tls'],
				},
			},
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