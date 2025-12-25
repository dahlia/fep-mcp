FEP MCP
=======

[![JSR][JSR badge]][JSR]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]

An [MCP] (Model Context Protocol) server that provides access to [Fediverse
Enhancement Proposals][FEP] (FEPs). This server clones the FEP repository from
Codeberg on startup and exposes tools and resources for AI assistants to read
and search FEP documents.

[JSR]: https://jsr.io/@hongminhee/fep-mcp
[JSR badge]: https://jsr.io/badges/@hongminhee/fep-mcp
[GitHub Actions]: https://github.com/dahlia/fep-mcp/actions/workflows/ci.yaml
[GitHub Actions badge]: https://github.com/dahlia/fep-mcp/actions/workflows/ci.yaml/badge.svg
[MCP]: https://modelcontextprotocol.io/
[FEP]: https://w3id.org/fep/


Why?
----

Codeberg has anti-AI protections that prevent AI tools like Claude or Gemini
from directly fetching FEP documents. This MCP server works around this
limitation by cloning the repository locally and serving the documents through
the MCP protocol.


Installation
------------

### Using JSR (recommended)

You can run the server directly from [JSR]:

~~~~sh
deno run \
  --allow-ffi \
  --allow-read \
  --allow-write \
  --allow-net \
  --allow-env \
  --allow-sys \
  jsr:@hongminhee/fep-mcp
~~~~

### Using a prebuilt binary

Download the prebuilt binary for your platform from the
[releases page][releases].

[releases]: https://github.com/dahlia/fep-mcp/releases

### Building from source

~~~~sh
git clone https://github.com/dahlia/fep-mcp.git
cd fep-mcp
deno task compile
~~~~


Usage with Claude Desktop
-------------------------

Add the following to your Claude Desktop configuration file:

 -  **macOS:** *~/Library/Application Support/Claude/claude_desktop_config.json*
 -  **Windows:** *%APPDATA%\Claude\claude_desktop_config.json*

~~~~json
{
  "mcpServers": {
    "fep": {
      "command": "deno",
      "args": [
        "run",
        "--allow-ffi",
        "--allow-read",
        "--allow-write",
        "--allow-net",
        "--allow-env",
        "--allow-sys",
        "jsr:@hongminhee/fep-mcp"
      ]
    }
  }
}
~~~~


Usage with Claude Code
----------------------

Add the server to your Claude Code MCP settings:

~~~~sh
claude mcp add fep -- \
  deno run \
  --allow-ffi \
  --allow-read \
  --allow-write \
  --allow-net \
  --allow-env \
  --allow-sys \
  jsr:@hongminhee/fep-mcp
~~~~


Available tools
---------------

### `list_feps`

Lists all FEPs with their metadata. Optionally filter by status (`DRAFT`,
`FINAL`, or `WITHDRAWN`).

### `get_fep`

Retrieves a specific FEP document by its 4-character hex slug (e.g., `a4ed`).

### `search_feps`

Searches FEPs by title, author, or content.

### `refresh_repository`

Pulls the latest FEP documents from the repository.


Available resources
-------------------

 -  `fep://index` — The complete FEP index in JSON format
 -  `fep://{slug}` — Individual FEP documents by slug


License
-------

Copyright (c) 2025 Hong Minhee and contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

See the [*LICENSE*](./LICENSE) file for details.
