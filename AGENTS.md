AGENTS.md
=========

This file provides guidance to LLM-based coding agents when working with
code in this repository.


Project overview
----------------

FEP MCP is an MCP (Model Context Protocol) server that provides access to
Fediverse Enhancement Proposals (FEPs). It clones the FEP repository from
Codeberg on startup and exposes tools and resources for AI assistants to read
and search FEP documents.


Development commands
--------------------

~~~~ sh
deno task start     # Run the MCP server
deno task check     # Type check
deno task lint      # Lint code
deno task fmt       # Format code
deno task compile   # Build standalone binary
deno task pack      # Create release packages for all platforms
~~~~


Architecture
------------

The server is structured around these main components:

 -  *main.ts*: Entry point that initializes the repository, creates the MCP
    server, and registers signal handlers for graceful shutdown

 -  *repository.ts*: Manages the FEP git repository (clone, refresh, file
    reading). Clones to a temp directory on startup with retry logic

 -  *tools.ts*: Implements MCP tools (`list_feps`, `get_fep`, `search_feps`,
    `refresh_repository`)

 -  *esources.ts*: Implements MCP resources (`fep://index`, `fep://{slug}`)

 -  *types.ts*: TypeScript type definitions for FEP metadata and documents

 -  *yaml.ts*: Parses YAML frontmatter from FEP markdown documents

Data flow: The server clones the FEP repository → reads *index.json* for
metadata → reads individual FEP markdown files from *fep/{slug}/fep-{slug}.md*
→ parses YAML frontmatter and returns structured data.


Platform notes
--------------

Windows does not support `SIGTERM` signal. Only `SIGINT` is registered on
Windows for graceful shutdown.


Available tools
---------------

### list_feps

Lists all FEPs with their metadata.

**Parameters:**

 -  `status` (optional): Filter by FEP status. One of `DRAFT`, `FINAL`,
    or `WITHDRAWN`.

**Example usage:**

~~~~
List all finalized FEPs.
~~~~

### get_fep

Retrieves a specific FEP document by its slug identifier.

**Parameters:**

 -  `slug` (required): The 4-character hex FEP identifier (e.g., `a4ed`).

**Example usage:**

~~~~
Get FEP-a4ed which describes the FEP process itself.
~~~~

### search_feps

Searches FEPs by title, author, or content.

**Parameters:**

 -  `query` (required): The search query string.

**Example usage:**

~~~~
Search for FEPs related to "ActivityPub" or "federation".
~~~~

### refresh_repository

Pulls the latest FEP documents from the repository. Use this when you need
the most up-to-date FEP content.

**Parameters:** None


Available resources
-------------------

### fep://index

The complete FEP index containing metadata for all Fediverse Enhancement
Proposals in JSON format.

### fep://{slug}

Individual FEP documents by their slug identifier. For example, `fep://a4ed`
retrieves FEP-a4ed.


Common queries
--------------

Here are some example queries you might use:

 -  "What FEPs are related to identity verification?"
 -  "Show me all FINAL FEPs"
 -  "Get the FEP about Object Links (FEP-e232)"
 -  "Search for FEPs by silverpill"
 -  "What does FEP-8b32 (Object Integrity Proofs) specify?"


About FEPs
----------

A Fediverse Enhancement Proposal (FEP) is a document that provides information
to the Fediverse community. The goal of a FEP is to improve interoperability
and well-being of diverse services, applications, and communities that form
the Fediverse.

FEP statuses:

 -  `DRAFT`: The proposal is being discussed and refined.
 -  `FINAL`: The proposal has been accepted and finalized.
 -  `WITHDRAWN`: The proposal has been withdrawn by its authors.

For more information about the FEP process, see FEP-a4ed.
