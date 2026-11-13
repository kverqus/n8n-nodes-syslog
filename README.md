# n8n-nodes-syslog

This is an n8n community node. It lets you forward syslog messages in your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Compatibility](#compatibility)  
[Resources](#resources)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Protocols

The syslog server is configured in the credential. UDP, TCP and TLS (over TCP) are supported. For TLS you can provide a CA certificate, or leave it empty to use the system trust store. Messages are sent one per line, so the server needs to accept newline delimited messages. Client certificates are not supported.

## Compatibility

Tested on N8N > 1.109.2

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
