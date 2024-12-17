# oci-bastion-action

![CI](https://github.com/domenikk/oci-bastion-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/domenikk/oci-bastion-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/domenikk/oci-bastion-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/domenikk/oci-bastion-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/domenikk/oci-bastion-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)


This action automates the creation of sessions on Oracle Cloud Infrastructure (OCI) [Bastion service](https://docs.oracle.com/en-us/iaas/Content/Bastion/Concepts/bastionoverview.htm) by:
- Adding the IP address of the runner to the bastion's allowed CIDR list
- Automatically enabling [bastion plugin](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/manage-plugins.htm#available-plugins) on the target instance, for managed SSH sessions
- Creating the session and waiting for it to become active

After you've used the action, you can use the `session-id`, `ssh-command` outputs to connect to the session in the subsequent steps.

## Usage

This action is tested to run on `ubuntu-latest` runner, but should work on `windows-latest` and `macos-latest` as well.

### Authentication

Credentials for authenticating the OCI SDK can be provided using one of the following methods:

1. Action inputs (`oci-user`, `oci-tenancy`, `oci-fingerprint`, `oci-key-content`, `oci-region`)
2. Environment variables (https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/clienvironmentvariables.htm)
3. Configuration file (`~/.oci/config`) (https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm)

The action will try each method in the order listed above and use the first one that provides all required information.

### Permissions

The provided user must have the necessary permissions to interact with the Bastion service and the target resource (in the case of managed SSH sessions).

## Inputs

| Name                         | Description                           
|------------------------------|-------------------------------------------------------------------------------------
| `oci‑user`                   | (*optional*) OCID of the user calling the API. Example: `ocid1.user.oc1..<unique_ID>`
| `oci‑tenancy`                | (*optional*) OCID of your tenancy. Example: `ocid1.tenancy.oc1..<unique_ID>`
| `oci‑fingerprint`            | (*optional*) Fingerprint for the public key that was added for `oci-user`
| `oci‑key-content`            | (*optional*) Private key content in PEM format
| `oci‑region`                 | (*optional*) An Oracle Cloud Infrastructure region. Example: `us-ashburn-1`
| `bastion‑id`                 | (*required*) OCID of the bastion. Example: `ocid1.bastion.oc1..<unique_ID>`
| `public‑key`                 | (*required*) The public key in OpenSSH format of the SSH key pair for the session. When you connect to the session, you must provide the private key of the same SSH key pair
| `session‑ttl‑seconds`        | (*optional*) The amount of time (in seconds) the session can remain active. Default: `3600`
| `session‑type`               | (*required*) Session type as described [here](https://docs.oracle.com/en-us/iaas/Content/Bastion/Concepts/bastionoverview.htm#session_types). One of: `MANAGED_SSH`, `PORT_FORWARDING` or `DYNAMIC_PORT_FORWARDING`
| `target‑resource‑id`         | (*optional*) The unique identifier (OCID) of the target resource
| `target‑resource‑fqdn`       | (*optional*) The Fully Qualified Domain Name of the target resource that the session connects to
| `target‑resource‑private‑ip` | (*optional*) The private IP address of the target resource that the session connects to
| `target‑resource‑port`       | (*optional*) The port number to connect to on the target resource
| `target‑resource‑user`       | (*optional*) The name of the user on the target resource operating system that the session uses for the connection. Required if `session-type` is `MANAGED_SSH`

## Outputs

| Name                         | Description
|------------------------------|-------------------------------------------------------------------------------------
| `session‑id`                 | The unique identifier (OCID) of the session
| `ssh‑command`                | SSH command template for connecting to the session

## Examples

### Managed SSH Session

```yaml
- uses: domenikk/oci-bastion-action@v1
  with:
    bastion-id: 'ocid1.bastion.oc1..<unique_ID>'
    public-key: ${{ secrets.PUBLIC_KEY }}
    session-type: 'MANAGED_SSH'
    target-resource-id: 'ocid1.instance.oc1..<unique_ID>'
    target-resource-user: 'opc'
```

### Port Forwarding Session

```yaml
- uses: domenikk/oci-bastion-action@v1
  with:
    bastion-id: 'ocid1.bastion.oc1..<unique_ID>'
    public-key: ${{ secrets.PUBLIC_KEY }}
    session-type: 'PORT_FORWARDING'
    target-resource-id: 'ocid1.instance.oc1..<unique_ID>'
    target-resource-port: 22
```

### Dynamic Port Forwarding (SOCKS Proxy) Session

```yaml
- uses: domenikk/oci-bastion-action@v1
  with:
    bastion-id: 'ocid1.bastion.oc1..<unique_ID>'
    public-key: ${{ secrets.PUBLIC_KEY }}
    session-type: 'DYNAMIC_PORT_FORWARDING'
```

## License

[Mozilla Public License v2.0](LICENSE)
