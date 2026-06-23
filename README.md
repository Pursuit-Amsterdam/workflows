# GitHub Workflows & Actions

A comprehensive collection of reusable GitHub Actions and workflows designed for modern web development projects. This repository provides automated CI/CD pipelines for JavaScript/TypeScript projects with support for multiple frameworks, code generation, testing, deployment, and secure secret management.

## 📋 Table of Contents

- [Overall Setup](#overall-setup)
- [Composite Actions](#composite-actions)
- [Workflows](#workflows)
- [Usage Examples](#usage-examples)

---

## Overall Setup

### Architecture Overview

This repository is structured to provide maximum reusability and modularity:

```
.github/
├── actions/                     # Reusable composite actions
│   ├── deploy-supabase/        # Supabase database migrations and deployment
│   ├── deploy-swarm/           # Docker Swarm stack deployment over SSH
│   ├── deploy-vercel/          # Vercel deployment with multiple build modes
│   ├── run-codegen/            # Code generation (GraphQL, types, etc.)
│   ├── run-docker-build-push/  # Docker image build and push to GHCR
│   ├── run-pnpm-build-test/    # Build, test, lint, and typecheck with PNPM
│   ├── run-python-checks/      # Ruff lint, Ruff format check, and pytest via uv
│   ├── run-supabase-test/      # Local Supabase environment setup and testing
│   ├── setup-node-pnpm/       # Node.js and PNPM environment setup
│   ├── setup-onepassword/     # Secure secret management with 1Password
│   ├── setup-python/          # Python (uv) environment setup
│   └── setup-version/         # Version management and environment variables
└── workflows/                   # Reusable workflows
    ├── backend-cd.yml          # Backend continuous deployment (Supabase)
    ├── backend-ci.yml          # Backend CI: Python checks + optional Supabase test
    ├── check-pr.yml            # PR validation and branch naming enforcement
    ├── codegen.yml             # Automated code generation pipeline
    ├── storybook-cd.yml        # Storybook deployment to GitHub Pages
    ├── vm-cd.yml               # VM deployment via Docker Swarm
    ├── web-cd.yml              # Generic web continuous deployment
    └── web-ci.yml              # Web application continuous integration
```

### Core Principles

- **� Reusability**: All actions and workflows are designed to be used across multiple projects
- **🎯 Modularity**: Each action has a single, well-defined responsibility
- **🛡️ Security**: Built-in secret management and security best practices
- **⚡ Performance**: Optimized for speed with intelligent caching and conditional execution
- **🔧 Flexibility**: Extensive configuration options for different project needs

### Quick Start Guide

#### 1. Basic CI Pipeline for a Next.js Project

Create `.github/workflows/ci.yml` in your repository:

```yaml
name: CI Pipeline
on: [push, pull_request]

jobs:
  web:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      run-test: true
      run-lint: true
      run-typecheck: true
```

#### 2. Code Generation Pipeline

Create `.github/workflows/codegen.yml`:

```yaml
name: Code Generation
on:
  pull_request:
    paths: ["**/*.graphql", "**/schema.ts", "package.json"]

jobs:
  codegen:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/codegen.yml@main
    with:
      generate-types: true
      generate-graphql: true
```

#### 3. Deployment Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "production"
      build-mode: "github"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

#### 4. Required Secrets Configuration

Configure these secrets in your repository or organization settings:

**For Vercel Deployments:**

- `VERCEL_TOKEN`: Your Vercel authentication token
- `VERCEL_ORG_ID`: Your Vercel organization ID
- `VERCEL_PROJECT_ID`: Your Vercel project ID

**For 1Password Integration:**

- `OP_SERVICE_ACCOUNT_TOKEN`: 1Password service account token

**For Supabase Backend:**

- `DB_CONNECTION_STRING`: Database connection URL
- `DB_PASSWORD`: Database password

---

## Composite Actions

### 🛠️ `setup-node-pnpm`

Sets up a Node.js environment with PNPM package manager, dependency caching, and GitHub Packages authentication.

**Location**: `.github/actions/setup-node-pnpm`

**Inputs:**

- `node-version` (default: `22.x`) - Node.js version to install
- `pnpm-version` (default: `latest`) - PNPM version to install
- `cache` (default: `true`) - Enable dependency caching for faster builds
- `node-auth-token` (optional) - Authentication token for private registries

**Features:**

- ✅ Automatic PNPM installation and caching
- 🔐 GitHub Packages authentication setup
- ⚡ Frozen lockfile installation for reproducible builds
- 📦 Private registry support

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@main
  with:
    node-version: "20.x"
    pnpm-version: "8.15.0"
    node-auth-token: ${{ secrets.GITHUB_TOKEN }}
```

---

### 🔨 `run-pnpm-build-test`

Comprehensive build, test, lint, and type-checking action with graceful error handling and customizable commands.

**Location**: `.github/actions/run-pnpm-build-test`

**Inputs:**

- `run-build` (default: `true`) - Execute build step
- `run-test` (default: `true`) - Execute test suite
- `run-lint` (default: `true`) - Execute linting
- `run-typecheck` (default: `true`) - Execute type checking
- `build-command` (default: `build`) - Custom build command name
- `test-command` (default: `test`) - Custom test command name
- `lint-command` (default: `lint`) - Custom lint command name
- `typecheck-command` (default: `typecheck`) - Custom typecheck command name

**Features:**

- ✅ Graceful handling of missing scripts (warns instead of failing)
- 🔄 Customizable command names for different project setups
- 📦 Built with PNPM package manager
- ⚡ Conditional execution based on inputs

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/run-pnpm-build-test@main
  with:
    run-test: true
    run-lint: true
    run-typecheck: true
    test-command: "test:coverage"
    build-command: "build:prod"
```

---

### 🐍 `setup-python`

Installs [uv](https://docs.astral.sh/uv/), a pinned Python version, and syncs project dependencies from `uv.lock` (default + dev groups, so Ruff/pytest are available).

**Location**: `.github/actions/setup-python`

**Inputs:**

- `python-version` (default: `3.12`) - Python version to install
- `cache` (default: `true`) - Enable uv dependency caching
- `sync-args` (optional) - Extra args for `uv sync` (e.g. `--all-extras`)

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/setup-python@main
  with:
    python-version: "3.12"
```

---

### 🧹 `run-python-checks`

Runs Ruff lint, Ruff format check, and pytest via `uv run`. Each check is a hard failure (CI gate); pytest exit code 5 ("no tests collected") is treated as a pass.

**Location**: `.github/actions/run-python-checks`

**Inputs:**

- `run-lint` / `run-format-check` / `run-test` (default: `true`) - Toggle each check
- `lint-command` (default: `ruff check .`), `format-command` (default: `ruff format --check .`), `test-command` (default: `pytest`) - Command overrides

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/run-python-checks@main
  with:
    run-test: true
    test-command: "pytest -q"
```

---

### 🔄 `run-codegen`

Advanced code generation pipeline supporting multiple generation types and custom commands.

**Location**: `.github/actions/run-codegen`

**Inputs:**

- `generate-importmap` (default: `true`) - Generate ES module import maps
- `generate-types` (default: `true`) - Generate TypeScript types
- `generate-graphql` (default: `false`) - Generate GraphQL schema and operations
- `generate-payload` (default: `false`) - Generate PayloadCMS collection types
- `custom-commands` - Space-separated list of additional commands to run
- `custom-command` - Single custom command (overrides all standard commands)

**Supported Generators:**

- 📝 TypeScript type generation (`generate:types`)
- 🌐 GraphQL schema and operations (`generate:graphql`)
- 📦 ES module import maps (`generate:importmap`)
- 🏗️ PayloadCMS collection types (`generate:payload`)
- 🔧 Custom generation commands

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/run-codegen@main
  with:
    generate-types: true
    generate-graphql: true
    custom-commands: "generate:prisma generate:openapi"
```

---

### 🔐 `setup-onepassword`

Secure environment variable management using 1Password vaults with optional Vercel and Docker build-arg integration.

**Location**: `.github/actions/setup-onepassword`

**Inputs:**

- `service-account-token` (**required**) - 1Password service account token
- `vault-name` (**required**) - 1Password vault name
- `item-name` (**required**) - 1Password item name containing secrets
- `export-for-vercel` (default: `false`) - Export secrets for Vercel deployment
- `vercel-env-file` (default: `vercel_env_args.bin`) - File path for Vercel env args
- `export-build-args` (default: `false`) - Emit a space-separated `key=value` list of the non-concealed fields for use as Docker build args

**Outputs:**

- `build_args` - Space-separated `key=value` list of non-concealed fields (e.g. `NEXT_PUBLIC_*`), suitable for the `build-args` input of `run-docker-build-push`

**Features:**

- 🔒 Secure secret loading from 1Password vaults
- 🎭 Automatic secret masking in GitHub Actions logs
- 🚀 Direct Vercel deployment integration
- 🐳 Docker build-arg export (non-concealed fields only)
- 📁 Support for multi-line environment variables
- 🛡️ Service account authentication
- 🔑 Distinguishes between concealed and public fields

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/setup-onepassword@main
  with:
    service-account-token: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
    vault-name: "my-project"
    item-name: "production-env"
    export-for-vercel: true
```

---

### 🚀 `deploy-vercel`

Sophisticated Vercel deployment action with multiple build modes and environment management.

**Location**: `.github/actions/deploy-vercel`

**Inputs:**

- `vercel-token` (**required**) - Vercel authentication token
- `vercel-org-id` (**required**) - Vercel organization ID
- `vercel-project-id` (**required**) - Vercel project ID
- `environment` (default: `staging`) - Deployment environment
- `build-mode` (default: `github`) - Build location (`github` or `vercel`)
- `prepare-package` (default: `false`) - Remove `"type": "module"` for runtime compatibility
- `build-command` - Custom build command for GitHub build mode
- `vercel-env-args-file` - Path to file containing environment arguments

**Build Modes:**

- **GitHub Build (`github`)**: Builds artifacts in GitHub Actions, deploys as prebuilt
- **Vercel Build (`vercel`)**: Deploys source code, builds on Vercel infrastructure

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/deploy-vercel@main
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    environment: "production"
    build-mode: "github"
```

---

### 📝 `setup-version`

Version management action that computes version strings and exports them as environment variables with framework-specific support.

**Location**: `.github/actions/setup-version`

**Inputs:**

- `version` (**required**) - Semantic version (e.g., `1.2.3` or `v1.2.3`)
- `framework` (optional) - Framework hint (`nextjs` prefixes with `NEXT_PUBLIC_`)
- `environment` (default: `production`) - Target environment (dev builds get commit suffix)

**Outputs:**

- `version` - The computed version string
- `version_var_name` - The environment variable name that was set

**Features:**

- 📅 Automatic version normalization (ensures `v` prefix)
- 🔄 Development build suffix (`-dev-{commit}` for dev environments)
- 🎯 Framework-specific environment variables (Next.js public vars)
- 📊 Commit SHA integration for unique dev builds

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/setup-version@main
  with:
    version: "1.2.3"
    framework: "nextjs"
    environment: "development"
```

---

### 🐳 `run-docker-build-push`

Docker image build and push action for GitHub Container Registry with multi-platform support.

**Location**: `.github/actions/run-docker-build-push`

**Inputs:**

- `docker-file` (default: `./Dockerfile`) - Path to the Dockerfile
- `image-name` (**required**) - Name of the Docker image to build and push
- `image-tag` (**required**) - Tag for the Docker image
- `image-platform` (default: `linux/amd64`) - Target platform for the Docker image
- `build-args` - Build arguments for Docker build (space-separated)
- `github-token` (**required**) - GitHub token for registry authentication
- `node-auth-token` - Node.js authentication token for private npm packages during build
- `python-auth-token` - GitHub token for private Python packages during build

**Features:**

- 🐳 Docker Buildx support for advanced builds
- 📦 Automatic GitHub Container Registry authentication
- 🚀 Build cache optimization (GitHub Actions cache)
- 🔐 Secure handling of private package registries
- 🌍 Multi-platform build support
- ⚡ Layer caching for faster builds

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/run-docker-build-push@main
  with:
    image-name: "ghcr.io/my-org/my-app"
    image-tag: ${{ github.sha }}
    build-args: "NODE_ENV=production APP_VERSION=1.0.0"
    github-token: ${{ secrets.GITHUB_TOKEN }}
    node-auth-token: ${{ secrets.GITHUB_TOKEN }}
```

---

### 🧪 `run-supabase-test`

Local Supabase development environment setup action for testing with database initialization and seeding support.

**Location**: `.github/actions/run-supabase-test`

**Inputs:**

- `supabase-cli-version` (default: `latest`) - Supabase CLI version to install
- `wait-timeout` (default: `300`) - Timeout in seconds to wait for services
- `project-id` - Supabase project ID for specific configuration
- `seed` (default: `false`) - Whether to seed the database after starting

**Outputs:**

- `api-url` - Local Supabase API URL
- `db-url` - Local PostgreSQL database URL
- `anon-key` - Anonymous key for Supabase client
- `service-role-key` - Service role key for Supabase client

**Features:**

- 🐳 Docker-based local Supabase instance
- ⚡ Automatic service health checking
- 🔑 Automatic key and URL extraction
- 📊 Environment variable setup for subsequent steps
- 🚀 Project initialization if config doesn't exist
- 🌱 Optional database seeding
- 🧪 Automated database testing with `supabase test db`

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/run-supabase-test@main
  with:
    supabase-cli-version: "1.x"
    wait-timeout: "300"
    seed: true
```

---

### 🗄️ `deploy-supabase`

Supabase database migration action that applies migrations using the Supabase CLI with environment-aware database URL selection.

**Location**: `.github/actions/deploy-supabase`

**Inputs:**

- `env` (optional) - Environment name for URL selection
- `db-url` (**required**) - Supabase database URL
- `db-password` (**required**) - Supabase database password

**Features:**

-  Supabase CLI installation and configuration
- 🗄️ Migration execution with `supabase db push`
- 🔐 Secure database URL and password handling

**Example Usage:**

```yaml
- uses: Pursuit-Amsterdam/workflows/.github/actions/deploy-supabase@main
  with:
    db-url: ${{ secrets.DB_URL_PRODUCTION }}
    db-password: ${{ secrets.DB_PASSWORD_PRODUCTION }}
```

---

## Workflows

### 🌐 `web-ci.yml` - Web Application CI Pipeline

Comprehensive CI pipeline for modern web applications with framework detection, code generation, and quality checks.

**Location**: `.github/workflows/web-ci.yml`

**Key Features:**

- 🎯 Multi-framework support (Next.js, Vue, React, etc.)
- 🔄 Intelligent code generation pipeline
- 🧪 Comprehensive quality checks (test, lint, typecheck)
- 🔐 1Password secrets integration
- ⚡ Fast, CI-focused execution

**Essential Inputs:**

- `framework` (**required**) - Framework type (next, vue, react, etc.)
- `node-version` (default: `22.x`) - Node.js version
- `working-directory` (default: `.`) - Project working directory

**Code Generation Options:**

- `codegen` (default: `false`) - Enable code generation
- `generate-types` (default: `true`) - Generate TypeScript types
- `generate-graphql` (default: `false`) - Generate GraphQL code
- `codegen_command` - Custom codegen command

**Quality Check Options:**

- `run-build` (default: `true`) - Run build step
- `run-test` (default: `true`) - Run tests
- `run-lint` (default: `true`) - Run linting
- `run-typecheck` (default: `true`) - Run type checking

**1Password Integration:**

- `onepassword_enabled` (default: `false`) - Enable 1Password secrets
- `onepassword_vault` - Vault name
- `onepassword_item` - Item name

**Example Usage:**

```yaml
jobs:
  ci:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      codegen: true
      generate-graphql: true
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "dev-env"
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

---

### 🚢 `web-cd.yml` - Generic Web Continuous Deployment

Generic web deployment workflow with platform abstraction (currently supports Vercel).

**Location**: `.github/workflows/web-cd.yml`

**Key Features:**

- 🌍 Multi-platform support (extensible architecture)
- 🛡️ Quality gates before deployment
- 🔄 Code generation integration
- 🔐 Secure secret management

**Essential Inputs:**

- `platform` (default: `vercel`) - Deployment platform
- `environment` (default: `preview`) - Target environment

**Quality Options:**

- `run-test` (default: `true`) - Run tests before deployment
- `run-lint` (default: `true`) - Run linting before deployment
- `run-typecheck` (default: `true`) - Run type checking before deployment

**Vercel-Specific Options:**

- `build-mode` (default: `github`) - Build location
- `prepare-package` (default: `false`) - Prepare package.json for runtime

**Example Usage:**

```yaml
jobs:
  deploy:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "production"
      build-mode: "github"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

###  `codegen.yml` - Automated Code Generation

Specialized workflow for automated code generation with intelligent change detection and automated PR management.

**Location**: `.github/workflows/codegen.yml`

**Key Features:**

- 🎯 Smart trigger detection (schema changes, config changes)
- 🔄 Automated PR creation for updates
- ✅ Validation mode for pull requests
- 🤖 Auto-commit capabilities
- 📅 Scheduled generation runs

**Trigger Conditions:**

- Schema file changes (`*.graphql`, `*.gql`, `schema.ts`)
- Configuration changes (`payload.config.ts`)
- Dependency updates (`package.json`, `pnpm-lock.yaml`)
- Manual workflow dispatch
- Pull request events

**Manual Inputs (workflow_dispatch):**

- `generate-types` (default: `true`) - Generate TypeScript types
- `generate-graphql` (default: `false`) - Generate GraphQL code
- `generate-payload` (default: `false`) - Generate PayloadCMS types
- `custom-commands` - Custom generation commands
- `auto-commit` (default: `false`) - Auto-commit changes to PR

**Behavior Modes:**

- **PR Mode**: Validates generated code is up-to-date, fails if outdated
- **Auto-commit Mode**: Automatically commits changes to PR branch
- **Scheduled Mode**: Creates new PR with generated changes

**Example Usage:**

```yaml
jobs:
  codegen:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/codegen.yml@main
    with:
      generate-types: true
      generate-graphql: true
      onepassword-vault: "my-project"
      onepassword-item: "dev-env"
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

---

### 🏗️ `backend-ci.yml` - Backend Continuous Integration

CI pipeline for Python backends (FastAPI, arq workers, ...) using **uv**: Ruff lint, Ruff format check, and pytest, with an optional local Supabase DB test merged in.

**Location**: `.github/workflows/backend-ci.yml`

**Key Features:**

- 🐍 uv-based Python environment with dependency caching
- 🧹 Ruff lint + format check, 🧪 pytest
- 🗄️ Optional local Supabase instance + `supabase test db`
- 🔐 1Password secrets integration for testing

**Inputs:**

- `python-version` (default: `3.12`) - Python version
- `working-directory` (default: `.`) - Project working directory
- `run-lint` / `run-format-check` / `run-test` (default: `true`) - Toggle each Python check
- `lint-command` (default: `ruff check .`), `format-command` (default: `ruff format --check .`), `test-command` (default: `pytest`) - Command overrides (run via `uv run`)
- `run-supabase-test` (default: `false`) - Spin up a local Supabase instance and run `supabase test db`
- `seed` (default: `false`) - Seed the Supabase DB before testing
- `onepassword_enabled` / `onepassword_vault` / `onepassword_item` - 1Password integration

> **Migration note:** the old `platform: supabase` input is gone. To keep running the Supabase DB test, set `run-supabase-test: true` (Python checks now run by default).

**Example Usage:**

```yaml
jobs:
  backend-ci:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/backend-ci.yml@main
    with:
      python-version: "3.12"
      working-directory: "apps/api"
      run-supabase-test: true   # optional, off by default
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "test-env"
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

The project must be a uv project (`pyproject.toml` + `uv.lock`) with `ruff` and `pytest` in its dev dependencies. FastAPI and arq workers share one Python project, so this single job covers both.

---

### 🗄️ `backend-cd.yml` - Backend Continuous Deployment

Generic backend deployment workflow supporting database migrations and backend services.

**Location**: `.github/workflows/backend-cd.yml`

**Key Features:**

- 🗄️ Database migration support
- 🎯 Platform abstraction (currently Supabase)
- 🔐 Environment-aware deployment
- 📊 Migration execution logging

**Essential Inputs:**

- `platform` (default: `supabase`) - Backend platform
- `environment` (default: `preview`) - Target environment
- `run-migrations` (default: `true`) - Execute database migrations
- `working-directory` (default: `.`) - Project working directory
- `node-version` (default: `22.x`) - Node.js version for actions

**Database Configuration:**

- `db-url-variable` (default: `DB_CONNECTION_STRING`) - Environment variable name for database URL
- `db-password-variable` (default: `DB_PASSWORD`) - Secret name for database password

**1Password Integration:**

- `onepassword_enabled` (default: `false`) - Enable 1Password secrets
- `onepassword_vault` - Vault name for deployment secrets
- `onepassword_item` - Item name for deployment secrets

**Supabase Support:**

- Environment-aware deployment
- Database migration execution via deploy-supabase action
- Automatic platform detection

**Example Usage:**

```yaml
jobs:
  backend-deploy:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/backend-cd.yml@main
    with:
      platform: "supabase"
      environment: "production"
      run-migrations: true
      db-url-variable: "DB_URL_PRODUCTION"
      db-password-variable: "DB_PASSWORD_PRODUCTION"
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
      DB_PASSWORD_PRODUCTION: ${{ secrets.DB_PASSWORD_PRODUCTION }}
```

---

### ✅ `check-pr.yml` - PR Validation and Branch Naming

Branch naming enforcement and pull request validation workflow ensuring proper Git workflow adherence.

**Location**: `.github/workflows/check-pr.yml`

**Key Features:**

- 🌳 Branch naming pattern enforcement
- 🔀 Merge rule validation
- 📋 Git workflow compliance
- ⚡ Fast validation execution

**Allowed Branch Patterns:**

- `main` - Main production branch
- `develop` - Development integration branch
- `feature/*` - Feature development branches
- `hotfix/*` - Hotfix branches
- `dependabot/*` - Dependency update branches

**Merge Rules:**

- `feature/*` → `develop`
- `dependabot/*` → `develop`
- `hotfix/*` → `main`
- `develop` → `main`
- `develop` → `acceptance`
- `main` → `develop`

**Example Usage:**

```yaml
jobs:
  check-pr:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/check-pr.yml@main
    with:
      head-ref: ${{ github.head_ref }}
      base-ref: ${{ github.base_ref }}
```

---

### 📖 `storybook-cd.yml` - Storybook Deployment

Automated Storybook deployment workflow to GitHub Pages for component documentation and design systems.

**Location**: `.github/workflows/storybook-cd.yml`

**Key Features:**

- 📖 Automated Storybook build and deployment
- 📄 GitHub Pages integration
- 🔐 Custom token support for private packages
- ⚡ Optimized build process with PNPM
- 🌐 Public component library hosting

**Essential Inputs:**

- `node-version` (default: `22.x`) - Node.js version
- `use-custom-token` (default: `false`) - Whether to use a custom token for authentication

**Permissions:**

- `contents: read` - Read repository contents
- `pages: write` - Write to GitHub Pages
- `id-token: write` - Generate deployment tokens

**Environment:**

- Deploys to `github-pages` environment
- Output URL available at `${{ steps.deploy.outputs.page_url }}`

**Features:**

- 🎨 Component documentation hosting
- 📦 Private package support via custom tokens
- 🔄 Automatic Pages artifact upload
- 🚀 Concurrent deployment protection

**Example Usage:**

```yaml
name: Deploy Storybook
on:
  push:
    branches: [main]

jobs:
  deploy-storybook:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/storybook-cd.yml@main
    with:
      node-version: "22.x"
      use-custom-token: true
    secrets:
      CUSTOM_GITHUB_TOKEN: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

**Prerequisites:**

- Repository must have GitHub Pages enabled
- `build-storybook` script must be defined in package.json
- Storybook must output to `storybook-static` directory

---

### 🖥️ `vm-cd.yml` - VM Deployment via Docker Swarm

Zero-downtime deployment of a stateless docker stack (e.g. Next.js frontend, FastAPI backend, arq workers) to a Docker Swarm running on a VM. Images are built and pushed to GHCR, then the stack is deployed over Docker's native SSH transport with rolling updates and automatic rollback.

**Location**: `.github/workflows/vm-cd.yml`

**Architecture:**

- The VM is a **Docker Swarm** manager (`docker swarm init`). All **stateless** services — plus a **Traefik** reverse proxy — live in one `docker-stack.yml` in your repo.
- **Stateful** services (Postgres, Redis) are **not** in the stack; they run as managed Azure services and are reached via connection strings injected from 1Password at deploy time.
- Zero-downtime and rollback come from the stack file's `deploy.update_config` (`order: start-first`, `failure_action: rollback`) plus per-service `healthcheck`. Traefik (native Swarm provider) shifts traffic to healthy tasks as they come up.

**Key Inputs:**

- `images` (**required**) - JSON array of images to build/push. Each entry: `{ "name": "ghcr.io/org/app-frontend", "dockerfile": "./apps/web/Dockerfile", "build-args": "public" }`. `"build-args": "public"` passes the non-concealed 1Password fields as build args (e.g. `NEXT_PUBLIC_*`).
- `stack-name` (**required**) - Swarm stack name
- `stack-file` (default `docker-stack.yml`) - Path to the stack file in your repo
- `ssh-host`, `ssh-user` (**required**), `ssh-port` (default `22`) - Swarm manager connection
- `environment` (default `production`) - Deployment environment
- `use-custom-token` (default `false`) - Use `CUSTOM_GITHUB_TOKEN` for private packages during build
- `converge-timeout` (default `180`) - Seconds to wait for services to reach their desired replica count
- `migrate-image` (optional) - Image **name** (without tag) to run once before deploying, e.g. the backend image for DB migrations. The current `VERSION` tag is applied automatically; empty skips migrations.
- `migrate-command` (optional) - Command override for the migration container, e.g. `alembic upgrade head`
- `onepassword_enabled` / `onepassword_vault` / `onepassword_item` - 1Password integration

**Secrets:**

- `VM_SSH_PRIVATE_KEY` (**required**) - Private key for the Swarm manager
- `VM_SSH_KNOWN_HOSTS` (optional) - `known_hosts` entry for the manager; if omitted the host is scanned with `ssh-keyscan`
- `OP_SERVICE_ACCOUNT_TOKEN` - 1Password service account token
- `CUSTOM_GITHUB_TOKEN` - Token for private npm/Python packages during build

**Example Usage:**

```yaml
jobs:
  deploy:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/vm-cd.yml@main
    with:
      stack-name: "myapp"
      ssh-host: "vm.example.com"
      ssh-user: "deploy"
      environment: "production"
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "production-env"
      # Reuse the backend image to run migrations once before deploying:
      migrate-image: "ghcr.io/pursuit-amsterdam/myapp-backend"
      migrate-command: "alembic upgrade head"
      images: |
        [
          {"name": "ghcr.io/pursuit-amsterdam/myapp-frontend", "dockerfile": "./apps/web/Dockerfile", "build-args": "public"},
          {"name": "ghcr.io/pursuit-amsterdam/myapp-backend", "dockerfile": "./apps/api/Dockerfile"}
        ]
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
      VM_SSH_PRIVATE_KEY: ${{ secrets.VM_SSH_PRIVATE_KEY }}
      VM_SSH_KNOWN_HOSTS: ${{ secrets.VM_SSH_KNOWN_HOSTS }}
```

**Consumer `docker-stack.yml` template:**

The workflow runs `docker stack deploy` on the runner against the remote Swarm; variables like `${VERSION}` (set by `setup-version`) and any 1Password fields (`${DATABASE_URL}`, `${REDIS_URL}`, ...) are interpolated from the runner environment into this file. The `workers` service reuses the backend image with a `command:` override.

```yaml
version: "3.9"

services:
  traefik:
    image: traefik:v3
    command:
      - --providers.swarm=true
      - --providers.swarm.exposedByDefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [web]
    deploy:
      placement:
        constraints: [node.role == manager]

  frontend:
    image: ghcr.io/pursuit-amsterdam/myapp-frontend:${VERSION}
    networks: [web]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      replicas: 2
      update_config:
        order: start-first
        failure_action: rollback
      labels:
        - traefik.enable=true
        - traefik.http.routers.frontend.rule=Host(`app.example.com`)
        - traefik.http.routers.frontend.entrypoints=websecure
        - traefik.http.services.frontend.loadbalancer.server.port=3000

  backend:
    image: ghcr.io/pursuit-amsterdam/myapp-backend:${VERSION}
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    networks: [web]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      replicas: 2
      update_config:
        order: start-first
        failure_action: rollback
      labels:
        - traefik.enable=true
        - traefik.http.routers.backend.rule=Host(`api.example.com`)
        - traefik.http.routers.backend.entrypoints=websecure
        - traefik.http.services.backend.loadbalancer.server.port=8000

  workers:
    image: ghcr.io/pursuit-amsterdam/myapp-backend:${VERSION}
    command: ["arq", "myapp.worker.WorkerSettings"]
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
    networks: [web]
    deploy:
      replicas: 1
      update_config:
        order: start-first
        failure_action: rollback

networks:
  web:
    driver: overlay
    attachable: true
```

> **Note:** Deploy-time interpolation stores secret values in the service spec on the manager (visible via `docker service inspect`). If that exposure matters, switch the connection strings to [Docker secrets](https://docs.docker.com/engine/swarm/secrets/) (`docker secret create` + a `secrets:` block) instead of `environment:`.

**Database migrations:**

Migrations are **not** a stack service (Swarm restarts completed containers and has no cross-service ordering). Instead, set `migrate-image` (+ optional `migrate-command`) and the workflow runs it as a one-off `docker run --rm` **on the VM, before the stack deploy**, against the managed DB. A non-zero exit aborts the deploy, leaving the running stack untouched. The named vars in the action's `migrate-env` (default `DATABASE_URL`) are forwarded into the container by name, so values stay off the command line. Keep migrations backward-compatible (expand/contract) since the old app keeps serving during the rolling update.

**One-time VM setup:**

- `docker swarm init` on the VM (manager node).
- Ensure the SSH deploy user can reach the Docker socket (member of the `docker` group).
- Point your DNS at the VM; for TLS, configure Traefik's ACME/Let's Encrypt resolver, or run HTTP-only if TLS terminates upstream (e.g. Cloudflare).

---

## Usage Examples

### Enterprise Next.js Application

Complete CI/CD pipeline for a production Next.js application with GraphQL, 1Password secrets, and multi-environment deployment.

```yaml
name: Enterprise CI/CD
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # Quality gates and validation
  quality-gates:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      node-version: "22.x"

      # Code generation
      codegen: true
      generate-types: true
      generate-graphql: true

      # Quality checks
      run-test: true
      run-lint: true
      run-typecheck: true

      # Custom commands
      test-command: "test:coverage"
      build-command: "build:prod"

      # Security
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: ${{ github.ref == 'refs/heads/main' && 'production-env' || 'staging-env' }}

    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

  # Deploy to appropriate environment
  deploy:
    needs: quality-gates
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
      build-mode: "github"
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: ${{ github.ref == 'refs/heads/main' && 'production-env' || 'staging-env' }}
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

---

### Monorepo with Multiple Services

Multi-service monorepo with frontend, backend API, and shared components.

```yaml
name: Monorepo CI/CD
on: [push, pull_request]

jobs:
  # Frontend application
  frontend:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      working-directory: "apps/web"
      codegen: true
      codegen_command: "pnpm --filter web generate"

  # Backend API service
  backend-api:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "node"
      working-directory: "apps/api"
      build-command: "build:api"
      test-command: "test:integration"

  # Shared component library
  shared-components:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "library"
      working-directory: "packages/ui"
      build-command: "build:components"

  # Deploy frontend to production
  deploy-frontend:
    needs: frontend
    if: github.ref == 'refs/heads/main'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      working-directory: "apps/web"
      environment: "production"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

  # Deploy backend services
  deploy-backend:
    needs: backend-api
    if: github.ref == 'refs/heads/main'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/backend-cd.yml@main
    with:
      platform: "supabase"
      working-directory: "apps/api"
      environment: "production"
    secrets:
      DB_URL_PRODUCTION: ${{ secrets.DB_URL_PRODUCTION }}
      DB_URL_STAGING: ${{ secrets.DB_URL_STAGING }}
```

---

### TypeScript Library with NPM Publishing

CI/CD for a TypeScript library with automated testing and NPM publishing on version tags.

```yaml
name: Library CI/CD
on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:

jobs:
  # Test and validate library
  ci:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "library"
      build-command: "build:lib"
      test-command: "test:coverage"
      lint-command: "lint:strict"

  # Publish to NPM on version tags
  publish:
    needs: ci
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Pursuit-Amsterdam/workflows/.github/actions/setup-node-pnpm@main
      - uses: Pursuit-Amsterdam/workflows/.github/actions/setup-version@main
        with:
          version: ${{ github.ref_name }}
      - run: pnpm publish --access public
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

### Automated Code Generation Pipeline

Dedicated code generation pipeline with automatic PR creation and scheduled updates.

```yaml
name: Code Generation
on:
  pull_request:
    paths:
      - "src/schema/**"
      - "graphql/**"
      - "payload.config.ts"
      - "package.json"
  schedule:
    - cron: "0 2 * * *" # Daily at 2 AM UTC
  workflow_dispatch:
    inputs:
      auto-commit:
        description: "Auto-commit changes"
        type: boolean
        default: false

jobs:
  codegen:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/codegen.yml@main
    with:
      generate-types: true
      generate-graphql: true
      generate-payload: true
      onepassword-vault: "my-project-dev"
      onepassword-item: "development-env"
      auto-commit: ${{ inputs.auto-commit || github.event_name == 'schedule' }}
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

---

### Multi-Environment Deployment Strategy

Advanced deployment strategy with different environments and approval gates.

```yaml
name: Multi-Environment Deploy
on:
  push:
    branches: [main, develop, staging]

jobs:
  # Always run quality checks
  quality-gates:
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      codegen: true
      generate-graphql: true

  # Development environment (auto-deploy from develop)
  deploy-dev:
    needs: quality-gates
    if: github.ref == 'refs/heads/develop'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "development"
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "dev-env"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

  # Staging environment (auto-deploy from staging branch)
  deploy-staging:
    needs: quality-gates
    if: github.ref == 'refs/heads/staging'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "staging"
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "staging-env"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

  # Production environment (manual approval required)
  deploy-production:
    needs: quality-gates
    if: github.ref == 'refs/heads/main'
    environment: production # Requires manual approval
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "production"
      build-mode: "github"
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "production-env"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

---

### Custom Build Pipeline with Matrix Strategy

Advanced pipeline using GitHub's matrix strategy for testing across multiple Node.js versions.

```yaml
name: Matrix Testing and Deployment
on: [push, pull_request]

jobs:
  # Test across multiple Node.js versions
  test-matrix:
    strategy:
      matrix:
        node-version: ["18.x", "20.x", "22.x"]
        include:
          - node-version: "22.x"
            deploy: true

    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      node-version: ${{ matrix.node-version }}
      run-build: ${{ matrix.deploy || false }}

  # Deploy only after all matrix jobs pass
  deploy:
    needs: test-matrix
    if: github.ref == 'refs/heads/main'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "production"
      node-version: "22.x" # Use latest for deployment
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

### Security-First Pipeline with Branch Protection

Enterprise-grade pipeline with comprehensive security checks and branch protection rules.

```yaml
name: Security-First Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # Validate PR branch naming and merge rules
  branch-validation:
    if: github.event_name == 'pull_request'
    uses: Pursuit-Amsterdam/workflows/.github/workflows/check-pr.yml@main
    with:
      head-ref: ${{ github.head_ref }}
      base-ref: ${{ github.base_ref }}

  # Comprehensive quality and security checks
  security-checks:
    needs: branch-validation
    if: always() && (needs.branch-validation.result == 'success' || github.event_name == 'push')
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"

      # Enhanced quality checks
      run-test: true
      run-lint: true
      run-typecheck: true
      test-command: "test:security"
      lint-command: "lint:security"

      # Code generation with validation
      codegen: true
      generate-types: true

      # Security secrets management
      onepassword_enabled: true
      onepassword_vault: "security-vault"
      onepassword_item: "app-secrets"

    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}

  # Secure deployment with approval gates
  secure-deploy:
    needs: security-checks
    if: github.ref == 'refs/heads/main'
    environment: production # Requires manual approval and environment protection
    uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
    with:
      platform: "vercel"
      environment: "production"
      build-mode: "github"

      # Additional security validation
      run-test: true
      test-command: "test:security"

      # Secure secret management
      onepassword_enabled: true
      onepassword_vault: "production-vault"
      onepassword_item: "production-secrets"

    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```
