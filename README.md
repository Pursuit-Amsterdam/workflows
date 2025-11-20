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
│   ├── deploy-vercel/          # Vercel deployment with multiple build modes
│   ├── run-build-test/         # Build, test, lint, and typecheck
│   ├── run-codegen/            # Code generation (GraphQL, types, etc.)
│   ├── setup-node-pnpm/       # Node.js and PNPM environment setup
│   ├── setup-onepassword/     # Secure secret management with 1Password
│   ├── setup-supabase/        # Supabase CLI setup
│   └── setup-version/         # Version management and environment variables
└── workflows/                   # Reusable workflows
    ├── backend-cd.yml          # Backend continuous deployment (Supabase)
    ├── backend-ci.yml          # Backend continuous integration (Supabase)
    ├── check-pr.yml            # PR validation and branch naming enforcement
    ├── codegen.yml             # Automated code generation pipeline
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
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/codegen.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
- uses: Data-Dialogue/workflows/.github/actions/setup-node-pnpm@main
  with:
    node-version: "20.x"
    pnpm-version: "8.15.0"
    node-auth-token: ${{ secrets.GITHUB_TOKEN }}
```

---

### 🔨 `run-build-test`

Comprehensive build, test, lint, and type-checking action with graceful error handling and customizable commands.

**Location**: `.github/actions/run-build-test`

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
- 📊 Clear success/failure reporting with emojis
- ⚡ Conditional execution based on inputs

**Example Usage:**

```yaml
- uses: Data-Dialogue/workflows/.github/actions/run-build-test@main
  with:
    run-test: true
    run-lint: true
    run-typecheck: true
    test-command: "test:coverage"
    build-command: "build:prod"
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
- uses: Data-Dialogue/workflows/.github/actions/run-codegen@main
  with:
    generate-types: true
    generate-graphql: true
    custom-commands: "generate:prisma generate:openapi"
```

---

### 🔐 `setup-onepassword`

Secure environment variable management using 1Password vaults with optional Vercel deployment integration.

**Location**: `.github/actions/setup-onepassword`

**Inputs:**

- `service-account-token` (**required**) - 1Password service account token
- `vault-name` (**required**) - 1Password vault name
- `item-name` (**required**) - 1Password item name containing secrets
- `export-for-vercel` (default: `false`) - Export secrets for Vercel deployment
- `vercel-env-file` (default: `vercel_env_args.bin`) - File path for Vercel env args

**Features:**

- 🔒 Secure secret loading from 1Password vaults
- 🎭 Automatic secret masking in GitHub Actions logs
- 🚀 Direct Vercel deployment integration
- 📁 Support for multi-line environment variables
- 🛡️ Service account authentication

**Example Usage:**

```yaml
- uses: Data-Dialogue/workflows/.github/actions/setup-onepassword@main
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
- uses: Data-Dialogue/workflows/.github/actions/deploy-vercel@main
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
- uses: Data-Dialogue/workflows/.github/actions/setup-version@main
  with:
    version: "1.2.3"
    framework: "nextjs"
    environment: "development"
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
- uses: Data-Dialogue/workflows/.github/actions/deploy-supabase@main
  with:
    db-url: ${{ secrets.DB_URL_PRODUCTION }}
    db-password: ${{ secrets.DB_PASSWORD_PRODUCTION }}
```

---

### 🏗️ `setup-supabase`

Local Supabase development environment setup action that initializes and starts Supabase services for testing.

**Location**: `.github/actions/setup-supabase`

**Inputs:**

- `supabase-cli-version` (default: `latest`) - Supabase CLI version to install
- `wait-timeout` (default: `300`) - Timeout in seconds to wait for services
- `project-id` (optional) - Supabase project ID for specific configuration

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

**Example Usage:**

```yaml
- uses: Data-Dialogue/workflows/.github/actions/setup-supabase@main
  with:
    supabase-cli-version: "1.x"
    wait-timeout: "300"
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
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/codegen.yml@main
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

Generic backend CI pipeline for testing and validating backend services, particularly Supabase-based applications.

**Location**: `.github/workflows/backend-ci.yml`

**Key Features:**

- 🐳 Docker-based local testing environment
- 🧪 Comprehensive backend service testing
- 🔐 1Password secrets integration for testing
- 🏗️ Local Supabase environment setup

**Essential Inputs:**

- `platform` (default: `supabase`) - Backend platform
- `node-version` (default: `22.x`) - Node.js version for actions
- `working-directory` (default: `.`) - Project working directory

**Testing Options:**

- Automatic local Supabase instance setup
- Database testing with `supabase:test` command
- Docker environment configuration

**1Password Integration:**

- `onepassword_enabled` (default: `false`) - Enable 1Password secrets
- `onepassword_vault` - Vault name for test secrets
- `onepassword_item` - Item name for test secrets

**Example Usage:**

```yaml
jobs:
  backend-ci:
    uses: Data-Dialogue/workflows/.github/workflows/backend-ci.yml@main
    with:
      platform: "supabase"
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: "test-env"
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

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
    uses: Data-Dialogue/workflows/.github/workflows/backend-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/check-pr.yml@main
    with:
      head-ref: ${{ github.head_ref }}
      base-ref: ${{ github.base_ref }}
```

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
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      working-directory: "apps/web"
      codegen: true
      codegen_command: "pnpm --filter web generate"

  # Backend API service
  backend-api:
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "node"
      working-directory: "apps/api"
      build-command: "build:api"
      test-command: "test:integration"

  # Shared component library
  shared-components:
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "library"
      working-directory: "packages/ui"
      build-command: "build:components"

  # Deploy frontend to production
  deploy-frontend:
    needs: frontend
    if: github.ref == 'refs/heads/main'
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/backend-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
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
      - uses: Data-Dialogue/workflows/.github/actions/setup-node-pnpm@main
      - uses: Data-Dialogue/workflows/.github/actions/setup-version@main
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
    uses: Data-Dialogue/workflows/.github/workflows/codegen.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      codegen: true
      generate-graphql: true

  # Development environment (auto-deploy from develop)
  deploy-dev:
    needs: quality-gates
    if: github.ref == 'refs/heads/develop'
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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

    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      node-version: ${{ matrix.node-version }}
      run-build: ${{ matrix.deploy || false }}

  # Deploy only after all matrix jobs pass
  deploy:
    needs: test-matrix
    if: github.ref == 'refs/heads/main'
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/check-pr.yml@main
    with:
      head-ref: ${{ github.head_ref }}
      base-ref: ${{ github.base_ref }}

  # Comprehensive quality and security checks
  security-checks:
    needs: branch-validation
    if: always() && (needs.branch-validation.result == 'success' || github.event_name == 'push')
    uses: Data-Dialogue/workflows/.github/workflows/web-ci.yml@main
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
    uses: Data-Dialogue/workflows/.github/workflows/web-cd.yml@main
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
