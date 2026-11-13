# Changelog

## 0.4.0 - 2026-11-13

### Upgrade notes

Existing workflows and credentials keep working. A few things behave differently and may be noticeable on the receiving side:

- RFC3164 messages now start with the application name as a tag (`appname: message`)
- Line breaks in messages are escaped as `\n` and `\r`
- An empty application name is always sent as `n8n`

### Added

- TLS support over TCP, with an optional CA certificate and an option to ignore SSL issues
- Support for continuing on error, so the remaining items are still sent when one fails
- Automated tests
- Documentation of credentials, parameters and output in the README

### Changed

- Hostname, application name, syslog version and item key name are now evaluated for every item, so expressions work per item
- In RFC3164 messages the application name is sent as the tag in front of the message
- An empty application name now always falls back to `n8n`
- Line breaks in messages are escaped so a message is always a single entry
- The syslog version can be set from an expression using `rfc3164` or `rfc5424`
- Errors now include the index of the item that failed
- The credential is now displayed as Syslog Server API
- Replaced gulp with a small copy script and updated the development dependencies

### Fixed

- An unknown syslog version now fails with an error instead of silently using RFC3164
- The connection to the syslog server was never closed, leaking a socket for every execution
- A connection error could crash n8n instead of failing the node

## 0.3.0 - 2025-09-07

### Changed

- Server settings (host, port, protocol and syslog version) moved into a credential. Existing workflows need a credential to be set up
- Reverted to a single output

## 0.2.0 - 2025-09-06

### Added

- Input data is passed through to the output

### Fixed

- Facility mapping
- Application name and hostname are set on the client again

## 0.1.1 - 2025-09-05

### Fixed

- Sending messages for multiple input items
