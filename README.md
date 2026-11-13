# n8n-nodes-syslog

This is an n8n community node. It lets you forward syslog messages in your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Credentials](#credentials)  
[Node parameters](#node-parameters)  
[Output](#output)  
[Protocols](#protocols)  
[Messages](#messages)  
[Compatibility](#compatibility)  
[Development](#development)  
[Resources](#resources)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Credentials

The syslog server is configured in a **Syslog Server API** credential.

| Field | Description |
| --- | --- |
| Host | IP or hostname of the syslog server |
| Port | Port of the syslog server, usually 514 (6514 for TLS) |
| Protocol | UDP, TCP or TLS (over TCP) |
| Syslog Version | Default syslog version, RFC3164 (BSD) or RFC5424 |
| CA Certificate | TLS only. PEM encoded CA certificate used to verify the server. Leave empty to use the system trust store |
| Ignore SSL Issues (Insecure) | TLS only. Connect even if the server certificate can't be verified |

## Node parameters

| Parameter | Description |
| --- | --- |
| Syslog Version | Use the version from the credential (default), or override it with RFC3164 or RFC5424 |
| Facility | Facility of the message, defaults to User |
| Severity | Severity of the message, defaults to Informational |
| Hostname | Hostname to put in the message, defaults to `localhost` |
| Application Name | Name of the sending application, defaults to `n8n` if left empty |
| Message | The message to send |
| Item Key Name | Name of the key that the result is added to on each item, defaults to `syslogStatus` |

All parameters can be expressions, and are evaluated for every input item. One message is sent per item. RFC3164 has no field for the application name, so it is sent as the tag in front of the message (`appname: message`).

## Output

Each input item is returned with the result added under the item key.

```json
{
  "id": 7,
  "syslogStatus": {
    "status": "Message sent",
    "message": "The message that was sent"
  }
}
```

By default the node stops at the first message that can't be sent, and the error tells which item failed. If **On Error** is set to *Continue (using regular output)* in the node settings, the remaining items are still sent and the failed items are returned with an error instead.

```json
{
  "id": 7,
  "syslogStatus": {
    "status": "Error",
    "error": "connect ECONNREFUSED 127.0.0.1:514"
  }
}
```

With UDP there is no confirmation from the server. `Message sent` only means that the message was handed to the network, so it doesn't prove that anyone received it. Use TCP or TLS if you need to know that the server is reachable.

## Protocols

UDP, TCP and TLS (over TCP) are supported. Messages are sent one per line, so the server needs to accept newline delimited messages. Client certificates are not supported.

## Messages

Line breaks in the message are escaped as `\n` and `\r`, so each message is always a single syslog entry. The node does not truncate messages. The size limit depends on the receiver: over UDP a message larger than a datagram (about 64 KiB) fails with an error, and many servers truncate or split long messages at around 8 KiB.

## Compatibility

Tested on n8n 1.109.2, 1.123 and 2.47.

## Development

The project uses [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm build   # compile to dist
pnpm test    # build and run the tests
pnpm lint
```

The tests run the node against local UDP, TCP and TLS listeners. The TLS tests need `openssl` and are skipped without it.

To try the node in n8n, mount this folder in the custom extensions directory of an n8n instance (`N8N_CUSTOM_EXTENSIONS`).

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Changelog](CHANGELOG.md)
