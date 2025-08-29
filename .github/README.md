# Software Agency GitHub Actions & Workflows

This directory contains a comprehensive collection of reusable GitHub Actions and workflows designed for modern web development projects. Our GitHub Actions suite provides automated CI/CD pipelines for JavaScript/TypeScript projects with support for multiple frameworks, code generation, testing, deployment, and secure secret management.

## 🏗️ Architecture Overview

```
.github/
├── actions/                  # Reusable composite actions
│   ├── build-test/          # Build, test, lint, and typecheck
│   ├── codegen/             # Code generation (GraphQL, types, etc.)
│   ├── onepassword-secrets/ # Secure secret management
│   ├── setup-node-pnpm/     # Node.js and PNPM setup
│   └── vercel-deploy/       # Vercel deployment
└── workflows/               # Reusable workflows
    ├── codegen.yml          # Automated code generation pipeline
    ├── node-ci.yml          # Node.js CI/CD pipeline
    ├── vercel-deploy.yml    # Vercel deployment pipeline
    └── web-ci.yml           # Full-stack web application pipeline
```

## 🚀 Quick Start

### Basic Next.js Project with Vercel Deployment

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline
on: [push, pull_request]

jobs:
  web:
    uses: your-org/.github/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      vercel_deploy: true
      vercel_build_env: ${{ github.ref == 'refs/heads/main' && 'production' || 'preview' }}
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### TypeScript Library

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  ci:
    uses: your-org/.github/.github/workflows/node-ci.yml@main
    with:
      run-build: true
      run-test: true
      upload_artifacts: true
      artifact_path: "dist/"
```

## 📦 Available Actions

### 🛠️ `setup-node-pnpm`
Sets up Node.js environment with PNPM package manager and dependency caching.

**Inputs:**
- `node-version` (default: `22.x`) - Node.js version
- `pnpm-version` (default: `latest`) - PNPM version
- `cache` (default: `true`) - Enable dependency caching

**Example:**
```yaml
- uses: ./.github/actions/setup-node-pnpm
  with:
    node-version: '20.x'
    pnpm-version: '8.15.0'
```

### 🔨 `build-test`
Comprehensive build, test, lint, and type-checking action with flexible configuration.

**Inputs:**
- `run-build` (default: `true`) - Execute build step
- `run-test` (default: `true`) - Execute test suite
- `run-lint` (default: `true`) - Execute linting
- `run-typecheck` (default: `true`) - Execute type checking
- `build-command` (default: `build`) - Custom build command
- `test-command` (default: `test`) - Custom test command
- `lint-command` (default: `lint`) - Custom lint command
- `typecheck-command` (default: `type-check`) - Custom typecheck command

**Features:**
- ✅ Graceful handling of missing scripts
- 🔄 Customizable command names
- 📊 Clear success/failure reporting
- ⚡ Conditional execution based on inputs

### 🔄 `codegen`
Advanced code generation pipeline supporting multiple generation types and frameworks.

**Inputs:**
- `generate-importmap` (default: `true`) - Generate import maps
- `generate-types` (default: `true`) - Generate TypeScript types
- `generate-graphql` (default: `false`) - Generate GraphQL code
- `generate-payload` (default: `false`) - Generate PayloadCMS types
- `custom-commands` - Space-separated list of custom commands
- `custom-command` - Single custom command (overrides standard flow)

**Supported Generators:**
- 📝 TypeScript type generation
- 🌐 GraphQL schema and operations
- 📦 ES module import maps
- 🏗️ PayloadCMS collection types
- 🔧 Custom generation commands

### 🔐 `onepassword-secrets`
Secure environment variable management using 1Password vaults with Vercel integration.

**Inputs:**
- `service-account-token` (**required**) - 1Password service account token
- `vault-name` (**required**) - 1Password vault name
- `item-name` (**required**) - 1Password item name
- `export-for-vercel` (default: `false`) - Export for Vercel deployment
- `vercel-env-file` (default: `vercel_env_args.bin`) - Vercel env args file path

**Features:**
- 🔒 Secure secret loading from 1Password
- 🎭 Automatic secret masking in logs
- 🚀 Vercel deployment integration
- 📁 Multi-line environment variable support
- 🛡️ Service account authentication

### 🚀 `vercel-deploy`
Sophisticated Vercel deployment action with multiple build modes and environment management.

**Inputs:**
- `vercel-token` (**required**) - Vercel authentication token
- `vercel-org-id` (**required**) - Vercel organization ID
- `vercel-project-id` (**required**) - Vercel project ID
- `environment` (default: `staging`) - Deployment environment
- `build-mode` (default: `github`) - Build location (`github` or `vercel`)
- `prepare-package` (default: `false`) - Remove `"type": "module"` for runtime
- `build-command` - Custom build command for GitHub build mode

**Build Modes:**
- **GitHub Build**: Artifacts built in GitHub Actions, deployed as prebuilt
- **Vercel Build**: Source code deployed, built on Vercel infrastructure

## 🔄 Available Workflows

### 🌐 `web-ci.yml` - Full-Stack Web Application Pipeline
Comprehensive CI/CD pipeline for modern web applications with framework detection, code generation, testing, and deployment capabilities.

**Key Features:**
- 🎯 Multi-framework support (Next.js, Vue, React, etc.)
- 🔄 Intelligent code generation pipeline
- 🧪 Comprehensive quality checks (test, lint, typecheck)
- 🚀 Integrated Vercel deployment
- 🔐 1Password secrets integration
- 📦 Build artifact management

**Use Cases:**
- Next.js applications with GraphQL
- Vue.js SPAs with TypeScript
- React applications with custom build processes
- Full-stack applications with code generation

### 🏗️ `node-ci.yml` - Node.js CI Pipeline
Streamlined CI pipeline for Node.js projects without deployment concerns.

**Key Features:**
- ⚡ Fast setup and execution
- 🔧 Flexible build and test configuration
- 📊 Artifact upload support
- 🎯 Custom command support

**Use Cases:**
- TypeScript libraries
- Node.js backend services
- NPM packages
- Shared component libraries

### 🚀 `vercel-deploy.yml` - Vercel Deployment Pipeline
Dedicated deployment workflow with quality gates and environment management.

**Key Features:**
- 🛡️ Quality gates before deployment
- 🌍 Multi-environment support
- 🔄 Code generation integration
- 🔐 Secure secret management
- 📈 Deployment monitoring

### 🔄 `codegen.yml` - Automated Code Generation
Specialized workflow for automated code generation with intelligent change detection.

**Key Features:**
- 🎯 Smart trigger detection (schema changes, config changes)
- 🔄 Automated PR creation for updates
- ✅ Validation mode for pull requests
- 📅 Scheduled generation runs
- 🤖 Auto-commit capabilities

**Trigger Conditions:**
- Schema file changes (`*.graphql`, `*.gql`, `schema.ts`)
- Configuration changes (`payload.config.ts`)
- Dependency updates (`package.json`, `pnpm-lock.yaml`)
- Manual workflow dispatch
- Scheduled runs (daily at 2 AM UTC)

## 💡 Usage Examples

### Enterprise Next.js Application

```yaml
name: Enterprise CI/CD
on: 
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality-gates:
    uses: your-org/.github/.github/workflows/web-ci.yml@main
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
      
      # Deployment
      vercel_deploy: ${{ github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' }}
      vercel_build_env: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
      vercel_build_mode: "github"
      
      # Security
      onepassword_enabled: true
      onepassword_vault: "my-project"
      onepassword_item: ${{ github.ref == 'refs/heads/main' && 'production-env' || 'staging-env' }}
      
      # Artifacts
      upload_artifacts: true
      artifact_path: |
        .next/
        !.next/cache/
        
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

### Monorepo with Multiple Services

```yaml
name: Monorepo CI/CD
on: [push, pull_request]

jobs:
  frontend:
    uses: your-org/.github/.github/workflows/web-ci.yml@main
    with:
      framework: "next"
      working_directory: "apps/web"
      codegen: true
      codegen_command: "pnpm --filter web generate"
      vercel_deploy: true
      
  backend-api:
    uses: your-org/.github/.github/workflows/node-ci.yml@main
    with:
      working_directory: "apps/api"
      build-command: "build:api"
      test-command: "test:integration"
      
  shared-components:
    uses: your-org/.github/.github/workflows/node-ci.yml@main
    with:
      working_directory: "packages/ui"
      build-command: "build:components"
      upload_artifacts: true
      artifact_path: "packages/ui/dist/"
```

### TypeScript Library with NPM Publishing

```yaml
name: Library CI/CD
on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:

jobs:
  ci:
    uses: your-org/.github/.github/workflows/node-ci.yml@main
    with:
      build-command: "build:lib"
      test-command: "test:coverage"
      lint-command: "lint:strict"
      upload_artifacts: true
      artifact_path: "dist/"
      artifact_name: "library-build"
      
  publish:
    needs: ci
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm
      - run: pnpm publish --access public
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 🔧 Advanced Configuration

### Code Generation Pipeline

```yaml
# .github/workflows/codegen.yml
name: Code Generation
on:
  pull_request:
    paths:
      - 'src/schema/**'
      - 'graphql/**'
      - 'payload.config.ts'
  workflow_dispatch:
    inputs:
      auto-commit:
        description: 'Auto-commit changes'
        type: boolean
        default: false

jobs:
  codegen:
    uses: your-org/.github/.github/workflows/codegen.yml@main
    with:
      generate-types: true
      generate-graphql: true
      generate-payload: true
      onepassword-vault: "my-project-dev"
      onepassword-item: "development-env"
      auto-commit: ${{ inputs.auto-commit || false }}
    secrets:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

### Environment-Specific Deployments

```yaml
# Production deployment
name: Production Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: your-org/.github/.github/workflows/vercel-deploy.yml@main
    with:
      environment: "production"
      run-test: true
      run-typecheck: true
      codegen: true
      onepassword_enabled: true
      onepassword_vault: "production-vault"
      onepassword_item: "app-secrets"
    secrets:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

## 🔐 Security Best Practices

### 1Password Integration
Store sensitive environment variables in 1Password vaults and reference them in your workflows:

```yaml
# 1Password vault structure
production-env:
  DATABASE_URL: "postgresql://..."
  API_SECRET_KEY: "..."
  STRIPE_SECRET_KEY: "..."
  
staging-env:
  DATABASE_URL: "postgresql://staging..."
  API_SECRET_KEY: "..."
  STRIPE_SECRET_KEY: "..."
```

### GitHub Secrets Configuration
Configure these organization or repository secrets:

**Required for Vercel:**
- `VERCEL_TOKEN`: Vercel authentication token
- `VERCEL_ORG_ID`: Your Vercel organization ID
- `VERCEL_PROJECT_ID`: Your Vercel project ID

**Required for 1Password:**
- `OP_SERVICE_ACCOUNT_TOKEN`: 1Password service account token

## 📊 Monitoring & Debugging

### Artifact Collection
Enable artifact upload to debug build issues:

```yaml
with:
  upload_artifacts: true
  artifact_path: |
    dist/
    .next/
    build-logs/
  artifact_name: "debug-build-${{ github.sha }}"
```

### Verbose Logging
Enable detailed logging for troubleshooting:

```yaml
- name: Debug Environment
  run: |
    echo "Node version: $(node --version)"
    echo "PNPM version: $(pnpm --version)"
    echo "Working directory: $(pwd)"
    echo "Environment: ${{ inputs.environment }}"
    ls -la
```

## 🚀 Migration Guide

### From Individual Actions to Reusable Workflows

**Before:**
```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run build
      - run: npm test
```

**After:**
```yaml
jobs:
  ci:
    uses: your-org/.github/.github/workflows/node-ci.yml@main
    with:
      build-command: "build"
      test-command: "test"
```

### From Custom Actions to Composite Actions

**Before:**
```yaml
- name: Setup
  run: |
    corepack enable
    pnpm install
- name: Build
  run: pnpm build
```

**After:**
```yaml
- uses: ./.github/actions/setup-node-pnpm
- uses: ./.github/actions/build-test
  with:
    run-test: false
```

## 🔄 Version Management

Tag stable versions of your workflows for production use:

```bash
git tag -a v1.0.0 -m "Stable release v1.0.0"
git push origin v1.0.0
```

Reference specific versions in your workflows:
```yaml
uses: your-org/.github/.github/workflows/web-ci.yml@v1.0.0
```

## 🤝 Contributing

1. **Test Changes**: Always test workflow changes in a separate repository first
2. **Version Updates**: Update version references when making breaking changes
3. **Documentation**: Update this README when adding new features
4. **Backward Compatibility**: Maintain backward compatibility when possible

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
- [1Password CLI Documentation](https://developer.1password.com/docs/cli)
- [PNPM Documentation](https://pnpm.io/)

---

*This GitHub Actions suite is maintained by our software agency to standardize and streamline CI/CD processes across all client projects. For support or feature requests, please open an issue in this repository.*

